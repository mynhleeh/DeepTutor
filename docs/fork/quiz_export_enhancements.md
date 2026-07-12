# Quiz Export Enhancements

## Vấn đề gặp phải ở bản gốc (Original Issue)
Tính năng **Download Chat Markdown** của DeepTutor hoạt động tốt đối với các đoạn chat thông thường. Tuy nhiên, khi sử dụng tính năng **Quiz** (ví dụ thông qua `@grammar-analyzer` hoặc lệnh `/learn`), hệ thống gốc gặp các khiếm khuyết sau:
1. **Thiếu dữ liệu chi tiết của bài Quiz:** Các câu hỏi quiz được stream thông qua hệ thống `events` thay vì chèn trực tiếp vào `content` của message. Trình export gốc chỉ nối các trường `content`, khiến cho nội dung của bài quiz hoàn toàn trống rỗng trong file `.md` được xuất ra.
2. **Dư thừa Log hệ thống (`[Quiz Performance]`):** Backend và Frontend đồng bộ trạng thái trả lời của người dùng thông qua các tin nhắn ngầm định mang nhãn `[Quiz Performance]`. Các đoạn log này vốn được ẩn đi trên giao diện UI (thông qua `ChatMessages.tsx`), nhưng lại bị in nguyên xi ra file xuất Markdown, làm nhiễu loạn và làm xấu định dạng của tài liệu ôn tập.
3. **Thiếu câu trả lời thực tế của người dùng:** Cấu trúc bài quiz không tự động lưu lại những gì người dùng đã chọn (Đúng/Sai) trong mảng `events`, khiến người học khi tải file về chỉ có Câu hỏi và Đáp án chuẩn mà không biết mình từng làm sai ở đâu.

## Giải pháp Tối ưu (Optimized Fork Solution)
Chúng tôi đã xây dựng lại luồng xuất Markdown tại thư viện lõi `lib/chat-export.ts` để xử lý trọn vẹn 3 vấn đề trên bằng cách thiết kế một thuật toán Parsing và Merging:

### 1. Trích xuất toàn vẹn cấu trúc Quiz (Extracting Quiz Data)
Cập nhật `ExportableMessage` để tiếp nhận mảng `events`. Hàm `formatQuizMarkdown` mới được bổ sung sẽ quét các message mang `capability === "deep_question"`.
- Nếu quiz ở dạng streaming, nó dùng `extractStreamingQuizQuestions(msg.events)` để tái tạo.
- Nếu quiz trả về nguyên khối, nó dùng `extractQuizQuestions(doneEvent.metadata)`.
Sau đó, từng Câu hỏi, Lựa chọn A/B/C/D, Đáp án đúng và Giải thích được parse thành cấu trúc Markdown an toàn (`Blockquote` và `List`).

### 2. Thu thập lịch sử trả lời của User qua Regex (Parsing User Answers)
Thay vì vứt bỏ các dòng log `[Quiz Performance]`, hệ thống tạo một parser Regex (`extractUserAnswers`) chạy vòng lặp trước khi render:
- Quét các message có định dạng `1. [q_1] Q: ... -> Answered: A (Incorrect, correct: B)`
- Bóc tách `question_id` (ví dụ `q_1`), `user_answer` (ví dụ `A`), và `status` (`Correct/Incorrect`).
- Lưu trữ vào `Map<string, { answer, isCorrect }>` và ưu tiên giữ lại lần trả lời cuối cùng để đảm bảo kết quả chính xác nhất nếu user làm lại nhiều lần.

### 3. Hợp nhất dữ liệu và Làm sạch rác (Merging & Cleaning)
- Log `[Quiz Performance]` bị xoá bỏ hoàn toàn khỏi luồng render chính của hàm `buildChatMarkdown` nhờ cơ chế `filter()`.
- Dữ liệu câu trả lời của user trong `Map` được móc nối (merged) vào bảng câu hỏi markdown dưới định dạng trực quan:
  ```markdown
  > **Your Answer:** B ❌
  > **Correct Answer:** A
  ```

## Kết quả
Giờ đây, file Markdown xuất ra từ ứng dụng trở thành một cuốn **Review Guide (Sổ tay ôn tập)** chuẩn mực. Người học nhận được báo cáo chi tiết cho toàn bộ cuộc hội thoại, kèm theo cấu trúc bài Quiz sắc nét, đáp án đã chọn (hiển thị ❌ hoặc ✅), và không có bất kỳ log hệ thống nào bị lộ ra. Tính năng tương thích ngược hoàn hảo với các bề mặt khác như Partner chat.
