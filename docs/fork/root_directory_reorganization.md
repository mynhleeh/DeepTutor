# Thay đổi Cấu trúc Thư mục Gốc (Root Directory Reorganization)

Tài liệu này ghi chú lại sự khác biệt về cấu trúc thư mục gốc giữa bản fork này và mã nguồn gốc (upstream) của dự án DeepTutor.

## Mục đích (Why)

Thư mục gốc của dự án upstream chứa khá nhiều file tài liệu (docs), các file cấu hình Docker phụ trợ (cho các môi trường khác nhau) và cấu hình Agent/Skills. Sự tồn tại của quá nhiều file ở gốc gây khó khăn trong việc quản lý và tìm kiếm mã nguồn chính. 

Bản fork này đã tổ chức lại bằng cách di chuyển các file không bắt buộc phải nằm ở gốc vào các thư mục con theo đúng ngữ nghĩa, giúp dự án gọn gàng và dễ bảo trì hơn, trong khi vẫn giữ lại các file thiết yếu (như `README.md`, `.gitignore`, `docker-compose.yml`, `Dockerfile`, `pyproject.toml`) để không làm gãy các luồng CI/CD chuẩn.

## Chi tiết thay đổi (What Changed)

Tổng cộng 9 file đã được di chuyển ra khỏi thư mục gốc:

### 1. Tài liệu (Documentation)
Các file tài liệu phụ trợ được gom vào thư mục `docs/` và `.github/`:
- `CONTAINERIZATION.md` ➡️ `docs/CONTAINERIZATION.md`
- `Communication.md` ➡️ `docs/Communication.md`
- `CONTRIBUTING.md` ➡️ `.github/CONTRIBUTING.md` (chuẩn của GitHub để nhận diện Contribution guidelines)

### 2. Cấu hình AI Agent
Tuân theo chuẩn Workspace Customizations của hệ thống Agent:
- `AGENTS.md` ➡️ `.agents/AGENTS.md`
- `SKILL.md` ➡️ `.agents/skills/deeptutor-cli/SKILL.md`

### 3. Containerization (Docker / Podman phụ trợ)
Các file liên quan đến Docker/Podman ngoại trừ `Dockerfile` chính và `docker-compose.yml` (dùng cho production/luồng chuẩn) đều được đưa vào thư mục `docker/`:
- `Dockerfile.runner` ➡️ `docker/Dockerfile.runner`
- `docker-compose.dev.yml` ➡️ `docker/docker-compose.dev.yml`
- `docker-compose.ghcr.yml` ➡️ `docker/docker-compose.ghcr.yml`
- `compose.yaml` (dành riêng cho Podman) ➡️ `docker/compose.yaml`

## Ảnh hưởng và Tương thích (Impact & Adaptation)

Những thay đổi này yêu cầu cập nhật lại một vài tham chiếu nội bộ trong dự án, cụ thể:

1. **`docker-compose.yml`**:
   - Khối cấu hình của service `sandbox-runner` đã được sửa để trỏ context build đúng tới Dockerfile mới: `dockerfile: docker/Dockerfile.runner`.
   - Comment hướng dẫn sử dụng môi trường Dev đã được cập nhật thành: `python scripts/docker_compose.py -f docker-compose.yml -f docker/docker-compose.dev.yml up`.

2. **`docker/compose.yaml`**:
   - Các comment hướng dẫn sử dụng bên trong file đã được đổi sang sử dụng đường dẫn `-f docker/compose.yaml`.

3. **CI/CD (`.github/workflows/`)**:
   - Không bị ảnh hưởng. Các Action hiện tại như `docker-release.yml` hay `tests.yml` chỉ tham chiếu đến `Dockerfile` chính và không gọi các file compose phụ.

## Lưu ý khi đồng bộ (Sync) với Upstream

Vì vị trí của các file này trong bản fork đã khác biệt hoàn toàn so với upstream, khi thực hiện pull/merge từ upstream:
1. Nếu upstream có sự thay đổi nội dung trên các file này (ví dụ họ cập nhật `CONTAINERIZATION.md` ở thư mục gốc), Git có thể không tự động map sự thay đổi đó vào `docs/CONTAINERIZATION.md` ở bản fork.
2. **Hành động cần thiết**: Maintainer của bản fork cần xoá các file mới xuất hiện lại ở gốc do quá trình sync, sau đó copy thủ công những nội dung thay đổi (nếu có) vào các file nằm trong cấu trúc thư mục mới.
