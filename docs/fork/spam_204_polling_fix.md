# Fork Documentation: QuizViewer Notebook Lookup Optimization

## Mục đích tài liệu này

Tài liệu này ghi lại toàn bộ sự khác biệt giữa fork này và source code gốc
của DeepTutor (HKU Data Intelligence Lab, v1.5.0) tại file
`web/components/quiz/QuizViewer.tsx`, bao gồm: nguyên nhân thay đổi, phân tích
kỹ thuật đầy đủ, các rủi ro đã cân nhắc, và kết quả thực tế sau khi sửa đổi.
Bất kỳ ai bảo trì hoặc tiếp tục phát triển trên fork này có thể đọc tài liệu
này để hiểu rõ context của những thay đổi so với bản gốc.

---

## 1. Vấn đề trong source gốc

### 1.1 Hành vi quan sát được

Khi mở một quiz (capability `deep_question`), backend liên tục nhận hàng chục
đến hàng trăm request lặp lại:

```
GET /api/v1/question-notebook/entries/lookup/by-question → 204 No Content
GET /api/v1/question-notebook/entries/lookup/by-question → 204 No Content
... (lặp lại 50–100+ lần cho mỗi session)
```

### 1.2 Root cause phân tích

**Nguồn dữ liệu của `questions` prop:**

Trong `ChatMessages.tsx`, `quizQuestions` được tính bằng `useMemo` phụ thuộc vào
`msg.events`:

```typescript
const quizQuestions = useMemo(() => {
  if (msg.capability !== "deep_question") return null;
  if (resultEvent) return extractQuizQuestions(resultEvent.metadata);
  return extractStreamingQuizQuestions(msg.events ?? []);
}, [msg.capability, msg.events, resultEvent]);
```

`msg.events` là mảng WebSocket events — mỗi khi LLM emit một `quiz_question_emitted`
event mới, `msg.events` có thêm phần tử → reference thay đổi → `quizQuestions` tạo
mảng mới → `questions` prop của `QuizViewer` thay đổi reference.

**Trigger trong `QuizViewer.tsx`:**

```typescript
useEffect(() => {
  if (!sessionId) return;
  questions.forEach((question, i) => {
    const key = getQuestionKey(question, i);
    void refreshEntryId(key, sessionId, i);
  });
}, [sessionId, questions, refreshEntryId]);
```

Effect này chạy lại mỗi khi `questions` reference thay đổi. Với N câu hỏi và M
streaming events, tổng số request = **N × M**.

Ví dụ: Quiz 5 câu, 10 streaming events → 50 request 204. Quiz 10 câu, 20 events → 200 request.

**Vấn đề với `refreshEntryId` callback:**

```typescript
const refreshEntryId = useCallback(
  async (qKey: string, sId: string, questionIndex?: number) => {
    // ...
  },
  [turnId],  // ← reference thay đổi khi turnId thay đổi
);
```

`turnId` chỉ có giá trị sau khi `resultEvent` đến (cuối stream). Trong quá trình
streaming, `turnId = null`. Khi `resultEvent` đến, `refreshEntryId` tạo reference
mới → `useEffect` chạy thêm lần nữa với toàn bộ câu hỏi.

### 1.3 Hai vấn đề phụ phát hiện thêm

**Vấn đề A — AI Judgment mất khi mạng ngắt:**

Trong `handleAiJudge`, judgment chỉ được persist vào DB tại `onDone`. Nếu mạng
ngắt giữa stream, `onError` được gọi nhưng text đã stream được bị bỏ đi, không
lưu vào DB. Khi user reload trang, phần judgment đó mất hoàn toàn.

**Vấn đề B — turnId đến muộn:**

Nếu cache key không bao gồm `turnId`, lần lookup đầu (với `turnId = null`) và lần
lookup sau (với `turnId` có giá trị) sẽ dùng cùng cache key. Lookup thứ hai sẽ bị
skip dù có thể mang lại thông tin khác nhau.

---

## 2. Các thay đổi trong mã nguồn (Giải pháp)

Tổng cộng có 5 thay đổi được thực hiện trong `web/components/quiz/QuizViewer.tsx`.

### Thay đổi 1 — Khai báo `lookedUpRef`

Sử dụng `useRef` làm bộ nhớ đệm (cache) để đánh dấu các lookup đã thực hiện.
`useRef` đảm bảo rằng việc thay đổi cache không gây ra vòng lặp re-render.

```typescript
  const judgeHandlesRef = useRef<Map<number, QuizJudgeHandle>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lookedUpRef = useRef<Set<string>>(new Set());
```

### Thay đổi 2 — Xoá cache khi chuyển session

Đảm bảo rằng khi người dùng chuyển sang phiên làm việc mới, bộ nhớ đệm không
vô tình chặn việc tải dữ liệu của câu hỏi từ phiên mới (có cùng định danh ID fallback).
Lệnh này được đặt ngay trước lookup effect để dọn dẹp sớm.

```typescript
  useEffect(() => {
    lookedUpRef.current.clear();
  }, [sessionId]);
```

### Thay đổi 3 — Guard trong `refreshEntryId` (Core Fix)

Áp dụng cache key có chứa `turnId` (giải quyết Vấn đề B) và khoá request
nếu nó đã tồn tại trong bộ đệm. `add` vào `Set` xảy ra ngay lập tức một cách
đồng bộ trước khi `await`, ngăn chặn các race condition do concurrent effects
gây ra.

```typescript
  const refreshEntryId = useCallback(
    async (qKey: string, sId: string, questionIndex?: number) => {
      const cacheKey = `${sId}::${turnId ?? "_"}::${qKey}`;
      if (lookedUpRef.current.has(cacheKey)) return;
      lookedUpRef.current.add(cacheKey);
      try {
        const entry = await lookupNotebookEntry(sId, qKey, turnId);
```

### Thay đổi 4 — Invalidate cache sau khi nộp bài

Khi submit bài bằng `recordQuizResults`, DB sẽ sinh ra các Notebook Entries mới.
Sau bước này, client phải chủ động lookup lại để lấy `entry_id` nhằm cung cấp
cho các tính năng Bookmark và xếp Category. Vì vậy, ta cần clear cache.

```typescript
    void recordQuizResults(sessionId, submittedResults, turnId)
      .then(() => {
        lookedUpRef.current.clear();
        questions.forEach((question, i) => {
          void refreshEntryId(getQuestionKey(question, i), sessionId);
        });
```

### Thay đổi 5 — Lưu giữ phần đã stream của AI Judgment khi có lỗi (Fix Vấn đề A)

Sao chép cùng pattern lưu DB từ `onDone` sang `onError`.

```typescript
        onError: (message) => {
          let partialText = "";
          setJudgments((prev) => {
            const current = prev[idx] ?? EMPTY_JUDGMENT;
            partialText = current.text;
            return {
              ...prev,
              [idx]: { ...current, isStreaming: false, error: message },
            };
          });
          judgeHandlesRef.current.delete(idx);
          const key = q ? getQuestionKey(q, idx) : "";
          const eId = key ? entryIds[key] : undefined;
          if (eId && partialText.trim().length > 0) {
            void updateNotebookEntry(eId, { ai_judgment: partialText }).catch(
              () => {},
            );
          }
        },
```

---

## 3. Phân tích rủi ro và trade-off

### 3.1 Trade-off chính của việc Caching

Sau khi áp dụng cache, nếu một notebook entry được thay đổi từ nguồn khác (ví dụ:
từ tab trình duyệt thứ 2, hoặc admin panel) trong lúc user đang xem quiz trên tab
này mà không reload, thì `QuizViewer` sẽ không tự cập nhật sự thay đổi đó.
Đây là một trade-off hoàn toàn có thể chấp nhận được vì:

- Entry không tự động bị hệ thống thay đổi ngầm
- User rất hiếm khi mở song song cùng quiz ở nhiều tab
- Lợi ích về Performance/Băng thông (giảm ~90% request) hoàn toàn áp đảo điểm nghẽn UX nhỏ nhoi này.

### 3.2 Khẳng định an toàn trong các User Flow quan trọng

- **Reload trang:** Cache lưu trong `useRef` sẽ làm mới hoàn toàn. Component sẽ lấy lại toàn bộ state và render bình thường.
- **Bookmark/Category:** Đã được bảo vệ qua Thay đổi 4 (Clear cache sau Submit).
- **Chấm điểm lại khi rớt mạng:** Judgment một phần sẽ được lưu nhờ Thay đổi 5. Nếu bấm Submit để AI Judge lần nữa, kết quả đầy đủ (Full Judgment) sẽ được stream và tự động ghi đè lên text partial nhờ update cùng `eId`.
- **Lỗi trùng lặp fallback ID:** Xử lý nhờ kiến trúc React (Component Isolation) và Thay đổi 2.
- **Không gây Re-render vòng lặp:** `lookedUpRef.current.clear()` và `add()` không trigger re-render như `setState`.

---

## 4. Kết luận

- Số lượng Request 204 giảm mạnh từ `N × M` về `≤ 2N`. Backend hết bị spam liên tục gây tốn IO và log noise.
- Cải thiện UX nhờ bảo toàn được công sức chấm bài của AI nếu gặp mạng thiếu ổn định.
- Mã nguồn React thêm chuẩn mực nhờ loại bỏ race condition từ Effect-trigger trùng lặp.
