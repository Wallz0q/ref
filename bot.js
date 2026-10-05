const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const config = require('./config');

// Lokasi file database
const dbPath = './database.json';
const backupDir = './backup';

// Buat folder & file jika belum ada
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({
    produk: [],
    pesanan: [],
    pengguna: []
  }, null, 2));
}

const db = JSON.parse(fs.readFileSync(dbPath));
const prosesTambah = {};
const prosesBuktiTF = {}; 

let statusAutoBackup = true; 
let backupTimerInstance = null;

function saveDB() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function escapeHTML(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ==========================================
// MANAGEMENT STRUK & CHANNEL (REAL-TIME)
// ==========================================

async function kirimKeChannel(telegram, pesanan) {
  if (!config.CHANNEL_URL || config.CHANNEL_URL.trim() === "") {
    console.log('⚠️ Skip kirim channel: CHANNEL_URL kosong di config.');
    return;
  }

  try {
    let targetChannel = config.CHANNEL_URL;
    if (targetChannel.includes('t.me/')) {
      targetChannel = '@' + targetChannel.split('t.me/')[1];
    }

    const infoBotDiChat = await telegram.getChatMember(targetChannel, bot.botInfo.id);
    const statusAdmin = ['administrator', 'creator'].includes(infoBotDiChat.status);
    
    if (!statusAdmin) {
      console.error(`❌ Gagal kirim ke channel: Bot bukan admin di channel ${targetChannel}`);
      return;
    }

    const waktuWib = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const teksChannel = config.STRUK_KE_CHANNEL
      .replace('{username}', escapeHTML(pesanan.username))
      .replace('{nama}', escapeHTML(pesanan.produk.nama))
      .replace('{harga}', parseInt(pesanan.produk.harga).toLocaleString('id-ID'))
      .replace('{tanggal}', waktuWib);

    await telegram.sendMessage(targetChannel, teksChannel, { 
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('🛒 Order Sekarang', `https://t.me/${config.BOT_USERNAME}`)]
      ])
    });
    console.log('✅ Struk transaksi berhasil diposting ke channel');

  } catch (err) {
    console.error('❌ Gagal memproses struk ke channel:', err.message);
  }
}

async function kirimPesananKePembeli(telegram, pesanan) {
  const { isiTeks, isiFileId } = pesanan.produk;
  
  await telegram.sendMessage(pesanan.userId, `${isiTeks}`);
  
  if (isiFileId) {
    await telegram.sendDocument(pesanan.userId, isiFileId);
  }
  
  await kirimKeChannel(telegram, pesanan);
}

// ==========================================
// BACKUP MEKANIKAL & UTILITY FUNCTIONS
// ==========================================

async function prosesBackupMekanikal(botInstance) {
  try {
    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const namaFile = `database_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const backupPath = path.join(backupDir, namaFile);
    fs.copyFileSync(dbPath, backupPath);
    await botInstance.telegram.sendDocument(config.OWNER_ID, { source: backupPath }, {
      caption: escapeHTML(config.BACKUP_TEXT.replace('{waktu}', waktu)),
      parse_mode: 'HTML'
    });
    return true;
  } catch (err) {
    console.error('❌ Backup gagal:', err.message);
    return false;
  }
}

function jalankanSchedulerBackup(botInstance) {
  if (backupTimerInstance) clearInterval(backupTimerInstance);
  
  if (statusAutoBackup) {
    backupTimerInstance = setInterval(() => {
      prosesBackupMekanikal(botInstance);
    }, config.BACKUP_INTERVAL);
  }
}

function tambahPengguna(userId, username) {
  if (!db.pengguna.some(u => u.id === userId)) {
    db.pengguna.push({ id: userId, username: username || 'TidakAda', bergabung: new Date().toISOString() });
    saveDB();
  }
}

function dapatkanTeksStart(ctx) {
  const totalUser = db.pengguna.length;
  const transaksiSelesai = db.pesanan.filter(p => p.status === 'selesai');
  const totalTransaksi = transaksiSelesai.length;
  const totalIncome = transaksiSelesai.reduce((sum, p) => sum + parseInt(p.produk.harga || 0), 0);

  const uptimeSeconds = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const runtimeText = `${hours} jam, ${minutes} menit`;

  const userId = ctx.from.id;
  const namaDepan = ctx.from.first_name || 'Tidak Ada';
  const namaBelakang = ctx.from.last_name || '';

  let teksAwal = config.START_TEXT;
  if (teksAwal.includes("👋 Selamat Datang di Ming Yue Store ID!")) {
    teksAwal = teksAwal.replace(
      "👋 Selamat Datang di Ming Yue Store ID!", 
      "<blockquote>👋 Selamat Datang di Ming Yue Store ID!</blockquote>"
    );
  }

  return teksAwal
    .replace('{runtime}', runtimeText)
    .replace('{total_user}', totalUser)
    .replace('{total_income}', totalIncome.toLocaleString('id-ID'))
    .replace('{total_transaksi}', totalTransaksi)
    .replace('{user_id}', userId)
    .replace('{nama_depan}', escapeHTML(namaDepan))
    .replace('{nama_belakang}', escapeHTML(namaBelakang || '-'));
}

// ==========================================
// SEMPURNAKAN KELOLA UTAMA DAN URL TOMBOL
// ==========================================

const urlTestimoni = config.CHANNEL_URL.startsWith('@') 
  ? `https://t.me/${config.CHANNEL_URL.slice(1)}` 
  : config.CHANNEL_URL;

const usernameOwnerClean = config.OWNER_USERNAME.startsWith('@') 
  ? config.OWNER_USERNAME.slice(1) 
  : config.OWNER_USERNAME;

const komponenTombolStart = Markup.inlineKeyboard([
  [Markup.button.callback('🛍️ 𝗞𝗮𝘁𝗮𝗹𝗼𝗴 𝗽𝗿𝗼𝗱𝘂𝗸', 'menu_beli')],
  [Markup.button.url('⭐ 𝗖𝗵𝗮𝗻𝗻𝗲𝗹 𝘁𝗲𝘀𝘁𝗶𝗺𝗼𝗻𝗶', urlTestimoni)],
  [
    Markup.button.callback('⚙️ 𝗠𝗲𝗻𝘂 𝗢𝘄𝗻𝗲𝗿', 'menu_owner'),
    Markup.button.url('📞 𝗛𝘂𝗯𝘂𝗻𝗴𝗶 𝗼𝘄𝗻𝗲𝗿', `https://t.me/${usernameOwnerClean}`)
  ]
]);

// ==========================================
// INTEGRASI NEOPAY GATEWAY FUNCTIONS
// ==========================================

async function createNeoPayInvoice(amount) {
  try {
    const response = await fetch(`https://pay.varlzpedia.my.id/api/v1/deposit/create?apikey=${config.NEOPAY_API_KEY}&amount=${parseInt(amount)}`);
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('❌ Gagal membuat invoice NeoPay:', err.message);
    return null;
  }
}

function startPaymentCheck(telegram, pesananId) {
  const checkInterval = setInterval(async () => {
    const currentDb = JSON.parse(fs.readFileSync(dbPath));
    const pesanan = currentDb.pesanan.find(p => p.id === pesananId);

    if (!pesanan || pesanan.status !== 'menunggu_pembayaran' || pesanan.metode !== 'otomatis') {
      clearInterval(checkInterval);
      return;
    }

    try {
      const response = await fetch(`https://pay.varlzpedia.my.id/api/v1/checkstatus?apikey=${config.NEOPAY_API_KEY}&invoice_id=${pesanan.invoiceId}`);
      const data = await response.json();

      if (data && data.status === 'paid') {
        clearInterval(checkInterval);
        
        const index = db.pesanan.findIndex(p => p.id === pesananId);
        if (index !== -1) {
          db.pesanan[index].status = 'selesai';
          saveDB();
          
          await telegram.sendMessage(pesanan.userId, `✅ Pembayaran Otomatis berhasil dideteksi! Produk Anda sedang dikirim.`);
          await kirimPesananKePembeli(telegram, db.pesanan[index]);
        }
      } else if (new Date() > new Date(pesanan.expiredAt)) {
        clearInterval(checkInterval);
        const index = db.pesanan.findIndex(p => p.id === pesananId);
        if (index !== -1) {
          db.pesanan[index].status = 'expired';
          saveDB();
          await telegram.sendMessage(pesanan.userId, `❌ Batas waktu pembayaran pesanan ${escapeHTML(pesanan.produk.nama)} telah habis. Silakan pesan kembali.`, { parse_mode: 'HTML' });
        }
      }
    } catch (err) {
      console.error('❌ Gagal memeriksa status pembayaran:', err.message);
    }
  }, 10000);
}

// ==========================================
// INISIALISASI & PERINTAH BOT
// ==========================================

const bot = new Telegraf(config.BOT_TOKEN);

bot.telegram.getMe().then((info) => {
  bot.botInfo = info;
  jalankanSchedulerBackup(bot);
});

bot.command('autobackup', ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.reply('❌ Akses ditolak!', { parse_mode: 'HTML' });
  const param = ctx.message.text.slice(11).trim().toLowerCase();
  if (param === 'on') {
    statusAutoBackup = true;
    jalankanSchedulerBackup(bot);
    const mnt = Math.floor(config.BACKUP_INTERVAL / 60000);
    return ctx.reply(`🟢 <b>Auto Backup diaktifkan!</b> Bot akan mencadangkan database otomatis setiap <code>${mnt}</code> menit.`, { parse_mode: 'HTML' });
  } else if (param === 'off') {
    statusAutoBackup = false;
    if (backupTimerInstance) { clearInterval(backupTimerInstance); backupTimerInstance = null; }
    return ctx.reply('🔴 <b>Auto Backup dimatikan!</b> Sistem tidak akan mengirimkan berkas backup berkala sampai diaktifkan kembali.', { parse_mode: 'HTML' });
  } else {
    return ctx.reply('⚠️ Format salah! Gunakan:\n• <code>/autobackup on</code>\n• <code>/autobackup off</code>', { parse_mode: 'HTML' });
  }
});

bot.command('backup', async ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.reply('❌ Akses ditolak!', { parse_mode: 'HTML' });
  ctx.reply('⏳ Sedang memproses backup database manual, mohon tunggu...', { parse_mode: 'HTML' });
  const sukses = await prosesBackupMekanikal(bot);
  if (sukses) {
    ctx.reply('✅ <b>Backup Berhasil!</b> Berkas database .json terbaru telah dikirimkan ke chat privat Anda.', { parse_mode: 'HTML' });
  } else {
    ctx.reply('❌ <b>Backup Gagal!</b> Terjadi kendala saat menyalin berkas database.', { parse_mode: 'HTML' });
  }
});

// Perintah /getproduk (Khusus Owner)
bot.command('getproduk', ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.reply('❌ Akses ditolak!', { parse_mode: 'HTML' });
  if (db.produk.length === 0) return ctx.reply('❌ Belum ada produk yang tersimpan di database.', { parse_mode: 'HTML' });
  
  const tombol = db.produk.map(p => [Markup.button.callback(`📥 ${p.nama}`, `get_owner_${p.id}`)]);
  ctx.reply('📦 <b>[OWNER MENU]</b>\nPilih produk yang ingin Anda ambil datanya secara instan:', { 
    parse_mode: 'HTML', 
    ...Markup.inlineKeyboard(tombol) 
  });
});

bot.command('start', ctx => {
  tambahPengguna(ctx.from.id, ctx.from.username);
  const teks = dapatkanTeksStart(ctx);
  ctx.replyWithPhoto(config.START_PHOTO_URL, {
    caption: teks,
    parse_mode: 'HTML',
    ...komponenTombolStart
  });
});

bot.action('menu_utama', ctx => {
  const teks = dapatkanTeksStart(ctx);
  ctx.editMessageCaption(teks, { parse_mode: 'HTML', ...komponenTombolStart }).catch(() => {});
  ctx.answerCbQuery();
});

bot.action('menu_beli', ctx => {
  if (db.produk.length === 0) return ctx.answerCbQuery('❌ Belum ada produk tersedia.', { show_alert: true });
  const tombol = db.produk.map(p => [Markup.button.callback(`🛍️ ${p.nama} - Rp${p.harga}`, `beli_${p.id}`)]);
  tombol.push([Markup.button.callback('⬅️ 𝙆𝙀𝙈𝘽𝘼𝙇参 𝙆𝙀 𝙈𝙀𝙉𝙐', 'menu_utama')]);
  ctx.editMessageCaption('📋 𝙆𝘼𝙏𝘼𝙇𝙊𝙂 𝙋𝙍𝙊𝘿𝙐𝙆', { parse_mode: 'HTML', ...Markup.inlineKeyboard(tombol) }).catch(() => {});
  ctx.answerCbQuery();
});

bot.action('menu_owner', ctx => { 
  ctx.editMessageCaption(escapeHTML(config.TEXT_OWNER_MENU), { 
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ 𝙆𝙀𝙈𝘽𝘼𝙇𝙄 𝙆𝙀 𝙈𝙀𝙉𝙐', 'menu_utama')]])
  }).catch(() => {});
  ctx.answerCbQuery(); 
});

bot.command('addproduk', ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.reply('❌ Akses ditolak!', { parse_mode: 'HTML' });
  const args = ctx.message.text.slice(11).trim();
  if (!args || !args.includes(',')) return ctx.reply(escapeHTML(config.FORMAT_ADD), { parse_mode: 'HTML' });
  const [nama, harga] = args.split(',').map(v => v.trim());
  if (!nama || !harga) return ctx.reply('❌ Nama/harga tidak boleh kosong!', { parse_mode: 'HTML' });
  prosesTambah[ctx.from.id] = { tahap: 1, nama, harga: parseInt(harga) };
  ctx.reply(escapeHTML(config.MOHON_DESKRIPSI), { parse_mode: 'HTML' });
});

bot.command('delproduk', ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.reply('❌ Akses ditolak!', { parse_mode: 'HTML' });
  if (db.produk.length === 0) return ctx.reply('❌ Belum ada produk.', { parse_mode: 'HTML' });
  const tombol = db.produk.map(p => [Markup.button.callback(`❌ ${p.nama} - Rp${p.harga}`, `hapus_${p.id}`)]);
  ctx.reply('🗑️ Pilih produk:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(tombol) });
});

// ===================================================
// PERINTAH BROADCAST (MURNI HANYA MENGIRIM KONTEN OWNER)
// ===================================================
bot.command('broadcast', async ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.reply('❌ Akses hanya untuk Owner!', { parse_mode: 'HTML' });

  let targetMessage = ctx.message;
  let pesanBroadcast = '';
  let type = 'text';
  let fileId = null;

  // Mendukung sistem Balas (Reply) pesan/media
  if (ctx.message.reply_to_message) {
    targetMessage = ctx.message.reply_to_message;
    pesanBroadcast = targetMessage.text || targetMessage.caption || '';
  } else {
    pesanBroadcast = ctx.message.text.slice(10).trim();
  }

  // Identifikasi Tipe Media
  if (targetMessage.photo) {
    type = 'photo';
    fileId = targetMessage.photo[targetMessage.photo.length - 1].file_id;
  } else if (targetMessage.video) {
    type = 'video';
    fileId = targetMessage.video.file_id;
  } else if (type === 'text' && !pesanBroadcast) {
    return ctx.reply('⚠️ <b>Gunakan format:</b>\n• Kirim teks biasa: <code>/broadcast isi pesan</code>\n• Kirim media: Kirim foto/video dengan caption <code>/broadcast</code> atau reply foto/video tersebut dengan mengetik <code>/broadcast</code>', { parse_mode: 'HTML' });
  }

  ctx.reply(escapeHTML(config.BROADCAST_START), { parse_mode: 'HTML' });
  
  let berhasil = 0;
  let gagal = 0;

  for (const user of db.pengguna) {
    try {
      if (type === 'photo') {
        await ctx.telegram.sendPhoto(user.id, fileId, { caption: pesanBroadcast });
      } else if (type === 'video') {
        await ctx.telegram.sendVideo(user.id, fileId, { caption: pesanBroadcast });
      } else {
        await ctx.telegram.sendMessage(user.id, pesanBroadcast, { parse_mode: 'HTML' });
      }
      berhasil++;
    } catch (err) { 
      gagal++; 
    }
    // Jeda kecil antipembatasan server Telegram
    await new Promise(r => setTimeout(r, 60));
  }

  ctx.reply(escapeHTML(config.BROADCAST_DONE.replace('{berhasil}', berhasil).replace('{gagal}', gagal)), { parse_mode: 'HTML' });
});

bot.action(/^beli_(\d+)$/, ctx => {
  const produkId = parseInt(ctx.match[1]);
  const produk = db.produk.find(p => p.id === produkId);

  if (!produk) {
    ctx.reply('❌ Produk tidak ditemukan atau sudah dihapus!', { parse_mode: 'HTML' });
    return ctx.answerCbQuery();
  }

  ctx.answerCbQuery();
  
  ctx.reply(`💳 <b>PILIH METODE PEMBAYARAN</b>\n\n📦 Produk: ${escapeHTML(produk.nama)}\n💰 Harga: Rp${produk.harga.toLocaleString('id-ID')}\n\nSilakan pilih metode pembayaran di bawah ini:`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('⚡ PAYMENT OTOMATIS (QRIS GATEWAY)', `pay_auto_${produkId}`)],
      [Markup.button.callback('🏪 PAYMENT MANUAL (DANA OWNER)', `pay_manual_${produkId}`)],
      [Markup.button.callback('⬅️ 𝙆𝙀𝙈𝘽𝘼𝙇𝙄 𝙆𝙀 𝙈𝙀𝙉𝙐', 'menu_utama')]
    ])
  });
});

bot.action(/^pay_auto_(\d+)$/, async ctx => {
  const produkId = parseInt(ctx.match[1]);
  const produk = db.produk.find(p => p.id === produkId);
  if (!produk) return ctx.answerCbQuery('❌ Produk tidak ditemukan!');

  ctx.reply('⏳ Sedang men-generate QRIS Pembayaran Otomatis, mohon tunggu...', { parse_mode: 'HTML' });
  ctx.answerCbQuery();

  const invoice = await createNeoPayInvoice(produk.harga);
  if (!invoice || !invoice.success) {
    return ctx.reply('❌ Gagal terhubung ke Payment Gateway. Silakan coba lagi nanti.', { parse_mode: 'HTML' });
  }

  const pesananId = Date.now() + Math.floor(Math.random() * 1000);
  const pesanan = {
    id: pesananId,
    invoiceId: invoice.invoice_id,
    userId: ctx.from.id,
    username: ctx.from.username || 'TidakAda',
    produk: { ...produk },
    status: 'menunggu_pembayaran',
    metode: 'otomatis',
    expiredAt: invoice.expired_at
  };
  
  db.pesanan.push(pesanan);
  saveDB();

  const teksInvoice = `✨ INVOICE PEMBAYARAN OTOMATIS (NEOPAY) ✨\n\n` +
             `📝 Produk: ${escapeHTML(produk.nama)}\n` +
             `💵 Harga Produk: Rp${produk.harga.toLocaleString('id-ID')}\n` +
             `⚡ Biaya Admin: Rp${invoice.fee}\n` +
             `💰 Total Bayar: Rp${invoice.total}\n\n` +
             `📌 Silakan scan QRIS di atas melalui Dana, OVO, GoPay, LinkAja, atau Mobile Banking.\n` +
             `🔄 Sistem mendeteksi pembayaran otomatis. Jangan kirim bukti transfer.`;

  await ctx.replyWithPhoto(invoice.qris_image, {
    caption: teksInvoice,
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('❌ 𝘽𝘼𝙏𝘼𝙇𝙆𝘼𝙉 𝙏𝙍𝘼𝙉𝙎𝘼𝙆𝙎𝙄', `batal_${pesananId}`)]])
  });

  startPaymentCheck(ctx.telegram, pesananId);
});

bot.action(/^pay_manual_(\d+)$/, async ctx => {
  const produkId = parseInt(ctx.match[1]);
  const produk = db.produk.find(p => p.id === produkId);
  if (!produk) return ctx.answerCbQuery('❌ Produk tidak ditemukan!');

  ctx.answerCbQuery();

  const pesananId = Date.now() + Math.floor(Math.random() * 1000);
  const pesanan = {
    id: pesananId,
    userId: ctx.from.id,
    username: ctx.from.username || 'TidakAda',
    produk: { ...produk },
    status: 'menunggu_bukti',
    metode: 'manual',
    expiredAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() 
  };

  db.pesanan.push(pesanan);
  saveDB();

  prosesBuktiTF[ctx.from.id] = { pesananId: pesananId };

  const teksManual = `✨ INVOICE PEMBAYARAN MANUAL (DANA) ✨\n\n` +
                     `📝 Produk: ${escapeHTML(produk.nama)}\n` +
                     `💰 Total Bayar: Rp${produk.harga.toLocaleString('id-ID')}\n\n` +
                     `📌 Silakan transfer ke QRIS DANA di atas.\n\n` +
                     `📸 <b>PENTING:</b> Setelah transfer berhasil, harap <b>KIRIM FOTO BUKTI TRANSFER</b> langsung ke bot ini agar owner dapat memvalidasi dan memproses pesanan Anda.`;

  await ctx.replyWithPhoto(config.QRIS_MANUAL_URL, {
    caption: teksManual,
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('❌ 𝘽𝘼𝙏𝘼𝙇𝙆𝘼𝙉 𝙏𝙍𝘼𝙉𝙎𝘼𝙆𝙎𝙄', `batal_${pesananId}`)]])
  });
});

bot.action(/^acc_(\d+)$/, async ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.answerCbQuery('❌ Akses ditolak!');
  const pesananId = parseInt(ctx.match[1]);
  const index = db.pesanan.findIndex(p => p.id === pesananId);

  if (index === -1 || db.pesanan[index].status !== 'proses_owner') {
    return ctx.answerCbQuery('⚠️ Pesanan tidak ditemukan atau sudah diproses.');
  }

  ctx.answerCbQuery('✅ Transaksi Disetujui!');
  db.pesanan[index].status = 'selesai';
  saveDB();

  const pesanan = db.pesanan[index];
  
  await ctx.editMessageCaption(ctx.callbackQuery.message.caption + `\n\n🟢 <b>STATUS: DISETUJUI & DIKIRIM!</b>`, { parse_mode: 'HTML' });
  
  await ctx.telegram.sendMessage(pesanan.userId, `✅ <b>Pembayaran Manual Anda telah disetujui oleh Owner!</b> Berikut adalah pesanan Anda:`, { parse_mode: 'HTML' });
  await kirimPesananKePembeli(ctx.telegram, pesanan);
});

bot.action(/^tolak_(\d+)$/, async ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.answerCbQuery('❌ Akses ditolak!');
  const pesananId = parseInt(ctx.match[1]);
  const index = db.pesanan.findIndex(p => p.id === pesananId);

  if (index === -1 || db.pesanan[index].status !== 'proses_owner') {
    return ctx.answerCbQuery('⚠️ Pesanan tidak ditemukan atau sudah diproses.');
  }

  ctx.answerCbQuery('❌ Transaksi Ditolak!');
  db.pesanan[index].status = 'ditolak';
  saveDB();

  const pesanan = db.pesanan[index];

  await ctx.editMessageCaption(ctx.callbackQuery.message.caption + `\n\n🔴 <b>STATUS: DITOLAK OWNER!</b>`, { parse_mode: 'HTML' });

  await ctx.telegram.sendMessage(pesanan.userId, `❌ <b>Maaf, Pembayaran manual Anda ditolak oleh Owner.</b> Pastikan bukti transfer valid atau silakan hubungi owner.`, { parse_mode: 'HTML' });
});

bot.action(/^batal_(\d+)$/, ctx => {
  const pesananId = parseInt(ctx.match[1]);
  const index = db.pesanan.findIndex(p => p.id === pesananId);

  if (index === -1) return ctx.answerCbQuery('❌ Transaksi tidak ditemukan!');
  if (db.pesanan[index].status !== 'menunggu_pembayaran' && db.pesanan[index].status !== 'menunggu_bukti') {
    return ctx.answerCbQuery('⚠️ Transaksi ini tidak dapat dibatalkan.');
  }

  db.pesanan[index].status = 'batal';
  saveDB();

  if (prosesBuktiTF[ctx.from.id] && prosesBuktiTF[ctx.from.id].pesananId === pesananId) {
    delete prosesBuktiTF[ctx.from.id];
  }

  ctx.editMessageCaption(`❌ Transaksi untuk produk ${escapeHTML(db.pesanan[index].produk.nama)} telah berhasil dibatalkan.`, { parse_mode: 'HTML' });
  ctx.answerCbQuery('✅ Transaksi dibatalkan!');
});

// Callback Action untuk /getproduk (Khusus Owner)
bot.action(/^get_owner_(\d+)$/, async ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.answerCbQuery('❌ Akses ditolak!');
  const produkId = parseInt(ctx.match[1]);
  const produk = db.produk.find(p => p.id === produkId);
  if (!produk) return ctx.answerCbQuery('❌ Produk tidak ditemukan!');

  ctx.answerCbQuery();
  await ctx.reply(`📥 <b>DATA PRODUK INDUK:</b>\n\n📦 Nama: ${escapeHTML(produk.nama)}\n💵 Harga: Rp${produk.harga.toLocaleString('id-ID')}\n📝 Deskripsi: ${escapeHTML(produk.deskripsi || '-')}\n\n🤖 Isi Teks Produk:\n<code>${escapeHTML(produk.isiTeks || 'Kosong')}</code>`, { parse_mode: 'HTML' });
  if (produk.isiFileId) {
    await ctx.replyDocument(produk.isiFileId, { caption: '📂 File Database Terkait Produk Ini' });
  }
});

// Callback Action untuk Hapus Produk
bot.action(/^hapus_(\d+)$/, ctx => {
  if (ctx.from.id !== config.OWNER_ID) return ctx.answerCbQuery('❌ Akses ditolak!');
  const produkId = parseInt(ctx.match[1]);
  const idx = db.produk.findIndex(p => p.id === produkId);
  if (idx === -1) return ctx.answerCbQuery('❌ Produk tidak ditemukan!');
  
  db.produk.splice(idx, 1);
  saveDB();
  ctx.editMessageText(escapeHTML(config.DELETED_PRODUK_TEXT), { parse_mode: 'HTML' });
  ctx.answerCbQuery();
});

// Handling input teks & berkas dari user (Proses Input Tambah Produk / Kirim Bukti Transfer)
bot.on(['text', 'photo', 'document', 'video'], async ctx => {
  const userId = ctx.from.id;

  // 1. Validasi Proses Kirim Bukti Transfer Manual
  if (prosesBuktiTF[userId]) {
    const pId = prosesBuktiTF[userId].pesananId;
    const index = db.pesanan.findIndex(p => p.id === pId);

    if (index === -1 || db.pesanan[index].status !== 'menunggu_bukti') {
      delete prosesBuktiTF[userId];
      return;
    }

    let photoId = null;
    if (ctx.message.photo) {
      photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    } else if (ctx.message.document && ctx.message.document.mime_type.startsWith('image/')) {
      photoId = ctx.message.document.file_id;
    }

    if (!photoId) {
      return ctx.reply('⚠️ Mohon kirimkan bukti transfer berupa <b>GAMBAR / FOTO</b> yang jelas.', { parse_mode: 'HTML' });
    }

    db.pesanan[index].status = 'proses_owner';
    saveDB();
    delete prosesBuktiTF[userId];

    ctx.reply('✅ Bukti transfer Anda telah terkirim! Harap tunggu konfirmasi atau validasi manual dari Owner.', { parse_mode: 'HTML' });

    const pesanan = db.pesanan[index];
    const infoOwnerText = `🚨 <b>ADA PESANAN BARU (MANUAL DANA)</b> 🚨\n\n` +
                          `👤 Pembeli: @${escapeHTML(pesanan.username)} (<code>${pesanan.userId}</code>)\n` +
                          `🛍️ Produk: ${escapeHTML(pesanan.produk.nama)}\n` +
                          `💰 Total Tagihan: Rp${pesanan.produk.harga.toLocaleString('id-ID')}\n` +
                          `🆔 ID Pesanan: <code>${pesanan.id}</code>\n\n` +
                          `Silakan cek bukti foto di bawah ini dan tekan tombol konfirmasi:`;

    await ctx.telegram.sendPhoto(config.OWNER_ID, photoId, {
      caption: infoOwnerText,
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ SETUJUI (ACC)', `acc_${pesanan.id}`)],
        [Markup.button.callback('❌ TOLAK', `tolak_${pesanan.id}`)]
      ])
    });
    return;
  }

  // 2. Perintah Penambahan Produk Baru (Owner Only)
  if (prosesTambah[userId]) {
    const data = prosesTambah[userId];
    if (data.tahap === 1) {
      if (!ctx.message.text) return ctx.reply('❌ Deskripsi wajib berupa teks koran/paragraf!');
      data.deskripsi = ctx.message.text;
      data.tahap = 2;
      return ctx.reply(escapeHTML(config.MOHON_ISI), { parse_mode: 'HTML' });
    } else if (data.tahap === 2) {
      if (ctx.message.text) {
        data.isiTeks = ctx.message.text;
        data.isiFileId = null;
      } else if (ctx.message.document) {
        data.isiTeks = ctx.message.caption || `Berkas file: ${ctx.message.document.file_name}`;
        data.isiFileId = ctx.message.document.file_id;
      } else {
        return ctx.reply('❌ Kirim teks skrip langsung atau file ZIP/RAR berkas produk!');
      }

      db.produk.push({
        id: Date.now(),
        nama: data.nama,
        harga: data.harga,
        deskripsi: data.deskripsi,
        isiTeks: data.isiTeks,
        isiFileId: data.isiFileId
      });
      saveDB();
      delete prosesTambah[userId];
      return ctx.reply(escapeHTML(config.ADDED_PRODUK_TEXT), { parse_mode: 'HTML' });
    }
  }
});

bot.launch().then(() => console.log('🚀 Bot Ming Yue Store ID Online dan Siap Digunakan!'));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
