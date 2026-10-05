module.exports = {
  BOT_TOKEN: "8952879720:AAEtUE9KIyI50KZ-g4GuQZmK5Y0nnl71jBs",
  BOT_USERNAME: "darkness_act_bot", 
  OWNER_ID: 1957947685,
  OWNER_USERNAME: "budimbok", // 👈 GANTI DENGAN USERNAME TELEGRAM KAMU (Tanpa @)
  START_PHOTO_URL: "https://i.ibb.co.com/FkRNZDth/file-00000000a16881fab39bf28dfa8f7ae9.png",
  NEOPAY_API_KEY: "NF12e8A863814422dB9016cEB44f165d7C", 
  QRIS_MANUAL_URL: "https://i.ibb.co.com/k25MwXnF/Kode-QRIS-Bstoreid-Pulsa-Internet.jpg", 
  CHANNEL_URL: "@allinfobudi", 
  BACKUP_INTERVAL: 30 * 60 * 1000, 

  START_TEXT: `👋 Selamat Datang di Ming Yue Store.ID!

╭─〔 🤖 Informasi Bot 〕
│ ⏱ Runtime : {runtime}
│ 👥 Total User : {total_user}
│ 💵 Total Income : Rp{total_income}
│ 📊 Total Transaksi: {total_transaksi}
╰─────────────

╭─〔 😀 Profil Kamu 〕
│ • ID : {user_id}
│ • Nama Depan : {nama_depan}
│ • Nama Belakang : {nama_belakang}
╰─────────────

Silakan pilih menu di bawah ini untuk memulai pemesanan:`,

  ADDED_PRODUK_TEXT: "✅ Produk berhasil ditambahkan!",
  DELETED_PRODUK_TEXT: "✅ Produk dihapus!",
  FORMAT_ADD: "📝 Format: /addproduk Nama Produk, Harga\nContoh: /addproduk Bot Auto, 35000",
  MOHON_DESKRIPSI: "ℹ️ Kirim deskripsi produk:",
  MOHON_ISI: "📤 Kirim isi: teks, skrip, atau file ZIP",
  
  BAYAR_TEXT: `💳 SILAKAN LAKUKAN PEMBAYARAN
🛒 Produk: {nama}
💸 Total: Rp{harga}

Silakan scan QRIS di atas dan lakukan pembayaran. Setelah sukses, kirimkan bukti transfer ke Admin!`,

  STRUK_PEMBELIAN: `🧾 STRUK PEMBELIAN
🆔 ID: {id}
👤 Pembeli: @{username}
🛒 Produk: {nama}
💸 Harga: Rp{harga}
📅 Tanggal: {tanggal}
────────────────────
Terima kasih telah berbelanja di Ming Yue Store.ID!`,

  // FORMAT STRUK BARU SESUAI PERMINTAAN
  STRUK_KE_CHANNEL: `✅ <b>TRANSAKSI BERHASIL</b>

Pesanan berhasil di proses 

👤 <b>Pembeli :</b> @{username}
📦 <b>Produk :</b> {nama}
💰 <b>Harga :</b> Rp{harga}
⏰ <b>Waktu :</b> {tanggal}`,

  BROADCAST_START: "📢 Sedang mengirim pesan ke semua pengguna...",
  BROADCAST_DONE: "✅ Selesai!\nBerhasil: {berhasil}\nGagal: {gagal}",
  BACKUP_TEXT: "💾 Backup Database dibuat pada: {waktu}",
  TEXT_OTHERS: "📂 Menu Lainnya:\n• Cek Status\n• Bantuan\n• Info Bot",
  TEXT_TESTIMONI: "⭐ Testimoni Pembeli:\nBot berjalan lancar, pengiriman cepat dan aman.",
  TEXT_OWNER_MENU: `╭─〣 Owner Commands
│▢ /addproduk
│▢ /delproduk
│▢ /getproduk
│▢ /broadcast
│▢ /autobackup on
│▢ /autobackup off 
│▢ /backup 
╰──────────〣`
};
