# Thiết kế Ads Hub

Ads Hub phục vụ media buyer quản lý nhiều khách hàng. Công việc chính là nhận ra chiến dịch cần chú ý và chuyển dữ liệu thành báo cáo khách hàng.

## Tokens

| Vai trò         | Màu       |
| --------------- | --------- |
| Nền chính       | `#0d1118` |
| Bề mặt bảng/thẻ | `#131922` |
| Đường phân cách | `#252e3b` |
| Chữ chính       | `#e9edf5` |
| Hành động chính | `#a1a4ff` |
| Hiệu quả tốt    | `#61cfaf` |

Noto Sans được lưu cục bộ để hỗ trợ tiếng Việt và PDF; số liệu dùng tabular numerals. Logo dùng Arial với trọng lượng đối lập; ID và công thức dùng monospace.

## Bố cục

Dashboard là một bàn điều khiển: sidebar gọn, bộ lọc liên hoàn, hàng KPI, biểu đồ và panel phân tích, cuối cùng là bảng chiến dịch. Màu tím nhạt dành cho lựa chọn và thao tác chính. Panel Meta AI tập trung vào prompt đang chọn, CPA mục tiêu và trạng thái kết nối; nội dung trả về ghi rõ model/prompt/phạm vi. Trang Meta AI dùng hai cột thư viện và trình soạn prompt, với các biến bộ lọc có thể chèn trực tiếp.

```text
sidebar | tiêu đề + đồng bộ + báo cáo
        | BM → tài khoản → trạng thái → chiến dịch → thời gian
        | chi tiêu | ROAS | CPA | CTR
        | biểu đồ chi tiêu/chuyển đổi | phân tích
        | bảng chiến dịch
```

Báo cáo giữ mô hình thư mục khách hàng và tài liệu. Danh sách bên trái là 280px trên màn hình lớn; màn hình nhỏ chuyển thành danh sách ngang. Bảng có cuộn riêng, cột ngày và dòng tổng được giữ cố định.

## Tương tác

Focus bàn phím chỉ hiện trên phần tử đang focus; modal giữ focus và đóng bằng Escape. Dropdown có tìm kiếm, có thể sử dụng Tab/Enter. Tôn trọng `prefers-reduced-motion`. Màu luôn đi kèm nhãn trạng thái.

Thang chữ đọc: nội dung 16px, dữ liệu/nút 14px, chú thích tối thiểu 12px; không thu xuống 6–10px ở các breakpoint. Nút/ô nhập có chiều cao tối thiểu 40px. Nhãn ngày SVG dùng chiều rộng thực qua ResizeObserver để chữ không bị co lại; màn hình hẹp giảm số mốc ngày thay vì giảm cỡ chữ.
