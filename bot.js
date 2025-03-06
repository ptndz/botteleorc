const TelegramBot = require("node-telegram-bot-api");
const Tesseract = require("tesseract.js");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const pdfPoppler = require("pdf-poppler");

// Load token từ .env
require("dotenv").config();
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(TOKEN, { polling: true });

// Thư mục lưu ảnh tạm thời
const TEMP_DIR = path.join(__dirname, "temp_images");
fs.ensureDirSync(TEMP_DIR); // Đảm bảo thư mục tồn tại

// Xử lý file PDF
bot.on("document", async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.document.file_id;

    if (!msg.document.mime_type.includes("pdf")) {
        return bot.sendMessage(chatId, "⚠️ Vui lòng gửi một file PDF hoặc hình ảnh.");
    }

    bot.sendMessage(chatId, "📄 Đang tải và xử lý PDF...");

    try {
        // Tải file PDF về
        const fileLink = await bot.getFileLink(fileId);
        const pdfPath = path.join(TEMP_DIR, `temp_${Date.now()}.pdf`);
        const pdfBuffer = (await axios({ url: fileLink, responseType: "arraybuffer" })).data;
        await fs.writeFile(pdfPath, pdfBuffer);

        // Chuyển đổi PDF sang ảnh
        const outputDir = path.join(TEMP_DIR, `pdf_${Date.now()}`);
        fs.ensureDirSync(outputDir);

        const opts = {
            format: "png",
            out_dir: outputDir,
            out_prefix: "page",
            scale: 1024,
        };

        await pdfPoppler.convert(pdfPath, opts);

        // Lấy danh sách ảnh đã tạo
        const imageFiles = fs.readdirSync(outputDir).filter(file => file.endsWith(".png"));
        if (imageFiles.length === 0) {
            throw new Error("Không thể chuyển đổi PDF sang ảnh.");
        }

        let textResult = "";

        // Xử lý từng ảnh bằng OCR
        for (let i = 0; i < imageFiles.length; i++) {
            const imagePath = path.join(outputDir, imageFiles[i]);

            bot.sendMessage(chatId, `🔍 Đang nhận diện trang ${i + 1}...`);
            const { data: { text } } = await Tesseract.recognize(imagePath, "eng+vie");

            if (text.trim()) {
                textResult += `📄 Trang ${i + 1}:\n${text}\n\n`;
            }
        }

        // Gửi kết quả OCR
        if (textResult.trim()) {
            bot.sendMessage(chatId, `📜 Kết quả OCR:\n${textResult}`);
        } else {
            bot.sendMessage(chatId, "❌ Không nhận diện được văn bản nào trong PDF.");
        }

        // Xóa file tạm
        fs.removeSync(pdfPath);
        fs.removeSync(outputDir);
    } catch (error) {
        console.error("Lỗi:", error);
        bot.sendMessage(chatId, "❌ Lỗi khi xử lý file PDF.");
    }
});



// Xử lý hình ảnh
bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.photo[msg.photo.length - 1].file_id;

    bot.sendMessage(chatId, "🖼️ Đang tải ảnh và nhận diện văn bản...");

    try {
        const fileLink = await bot.getFileLink(fileId);
        const imageBuffer = (await axios({ url: fileLink, responseType: "arraybuffer" })).data;

        const { data: { text } } = await Tesseract.recognize(imageBuffer, "eng+vie");

        if (text.trim()) {
            bot.sendMessage(chatId, `📜 Kết quả OCR:\n${text}`);
        } else {
            bot.sendMessage(chatId, "❌ Không tìm thấy văn bản trong ảnh.");
        }
    } catch (error) {
        console.error("Lỗi:", error);
        bot.sendMessage(chatId, "❌ Lỗi khi xử lý ảnh.");
    }
});

console.log("🤖 Bot đang chạy...");
//🔹 Cài đặt bổ sung nếu cần (Ghostscript)
// Nếu gặp lỗi khi chạy pdf-poppler, hãy cài đặt Ghostscript:
// 🔹 Windows
// Tải và cài đặt Ghostscript từ: https://ghostscript.com/releases/gsdnld.html
// Sau đó, thêm đường dẫn gswin64c.exe vào PATH.
