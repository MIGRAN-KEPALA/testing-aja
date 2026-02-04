const { SlashCommandBuilder } = require('discord.js');
const User = require('../models/User');
const robloxService = require('../services/robloxService');
const paymentService = require('../services/paymentService');

const commands = {
  // Command untuk generate free key
  freekey: {
    data: new SlashCommandBuilder()
      .setName('freekey')
      .setDescription('Generate free key (berlaku 24 jam)'),
    async execute(interaction) {
      try {
        const discordId = interaction.user.id;
        const discordUsername = interaction.user.username;

        let user = await User.findOne({ discordId });

        if (!user) {
          user = new User({ discordId, discordUsername });
        }

        // Cek apakah user sudah punya free key aktif hari ini
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const activeFreeKey = user.keys.find(k => 
          k.type === 'free' && 
          k.isActive && 
          new Date(k.createdAt) >= today
        );

        if (activeFreeKey) {
          const expiresIn = Math.ceil((new Date(activeFreeKey.expiresAt) - new Date()) / (1000 * 60 * 60));
          return await interaction.reply({
            content: `❌ Kamu sudah mengklaim free key hari ini!\n\n🔑 Key: \`${activeFreeKey.key}\`\n⏰ Expires in: ${expiresIn} jam`,
            ephemeral: true
          });
        }

        const key = user.generateKey('free');
        await user.save();

        await interaction.reply({
          content: `✅ Free key berhasil dibuat!\n\n🔑 Key: \`${key}\`\n⏰ Valid for: 24 jam\n\n⚠️ Simpan key ini dengan aman!`,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error generating free key:', error);
        await interaction.reply({
          content: '❌ Terjadi error saat membuat free key.',
          ephemeral: true
        });
      }
    }
  },

  // Command untuk bind Roblox username
  bindroblox: {
    data: new SlashCommandBuilder()
      .setName('bindroblox')
      .setDescription('Bind Roblox username ke akun Discord kamu')
      .addStringOption(option =>
        option.setName('username')
          .setDescription('Roblox username kamu')
          .setRequired(true)
      ),
    async execute(interaction) {
      try {
        await interaction.deferReply({ ephemeral: true });

        const discordId = interaction.user.id;
        const discordUsername = interaction.user.username;
        const robloxUsername = interaction.options.getString('username');

        // Verify Roblox username
        const verification = await robloxService.verifyUsername(robloxUsername);

        if (!verification.success) {
          return await interaction.editReply({
            content: `❌ ${verification.message}`
          });
        }

        let user = await User.findOne({ discordId });

        if (!user) {
          user = new User({ discordId, discordUsername });
        }

        user.robloxUsername = verification.username;
        user.robloxId = verification.userId;
        await user.save();

        await interaction.editReply({
          content: `✅ Berhasil bind Roblox account!\n\n👤 Roblox Username: ${verification.username}\n🆔 Roblox ID: ${verification.userId}`
        });
      } catch (error) {
        console.error('Error binding Roblox:', error);
        await interaction.editReply({
          content: '❌ Terjadi error saat binding Roblox account.'
        });
      }
    }
  },

  // Command untuk bind HWID
  bindhwid: {
    data: new SlashCommandBuilder()
      .setName('bindhwid')
      .setDescription('Bind HWID ke akun kamu')
      .addStringOption(option =>
        option.setName('hwid')
          .setDescription('Hardware ID kamu')
          .setRequired(true)
      ),
    async execute(interaction) {
      try {
        const discordId = interaction.user.id;
        const discordUsername = interaction.user.username;
        const hwid = interaction.options.getString('hwid');

        let user = await User.findOne({ discordId });

        if (!user) {
          user = new User({ discordId, discordUsername });
        }

        // Cek apakah HWID sudah digunakan user lain
        const existingHwid = await User.findOne({ 
          hwid, 
          discordId: { $ne: discordId } 
        });

        if (existingHwid) {
          return await interaction.reply({
            content: '❌ HWID ini sudah digunakan oleh user lain!',
            ephemeral: true
          });
        }

        user.hwid = hwid;
        await user.save();

        await interaction.reply({
          content: `✅ Berhasil bind HWID!\n\n🔒 HWID: \`${hwid}\``,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error binding HWID:', error);
        await interaction.reply({
          content: '❌ Terjadi error saat binding HWID.',
          ephemeral: true
        });
      }
    }
  },

  // Command untuk cek status akun
  status: {
    data: new SlashCommandBuilder()
      .setName('status')
      .setDescription('Cek status akun kamu'),
    async execute(interaction) {
      try {
        const discordId = interaction.user.id;
        const user = await User.findOne({ discordId });

        if (!user) {
          return await interaction.reply({
            content: '❌ Akun kamu belum terdaftar. Gunakan `/freekey` untuk memulai!',
            ephemeral: true
          });
        }

        const activeKeys = user.keys.filter(k => 
          k.isActive && new Date() <= new Date(k.expiresAt)
        );

        let statusMessage = `**📊 Status Akun**\n\n`;
        statusMessage += `👤 Discord: ${user.discordUsername}\n`;
        statusMessage += `🎮 Roblox: ${user.robloxUsername || 'Belum di-bind'}\n`;
        statusMessage += `🔒 HWID: ${user.hwid ? 'Sudah di-bind' : 'Belum di-bind'}\n`;
        statusMessage += `\n**🔑 Active Keys: ${activeKeys.length}**\n`;

        if (activeKeys.length > 0) {
          activeKeys.forEach((key, index) => {
            const expiresIn = Math.ceil((new Date(key.expiresAt) - new Date()) / (1000 * 60 * 60));
            statusMessage += `\n${index + 1}. ${key.type === 'free' ? '🆓' : '💎'} \`${key.key}\``;
            statusMessage += `\n   ⏰ Expires in: ${expiresIn} jam\n`;
          });
        }

        await interaction.reply({
          content: statusMessage,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error checking status:', error);
        await interaction.reply({
          content: '❌ Terjadi error saat mengecek status.',
          ephemeral: true
        });
      }
    }
  },

  // Command untuk buy premium key
  buypremium: {
    data: new SlashCommandBuilder()
      .setName('buypremium')
      .setDescription('Beli premium key (berlaku 30 hari)')
      .addIntegerOption(option =>
        option.setName('amount')
          .setDescription('Pilih paket')
          .setRequired(true)
          .addChoices(
            { name: 'Rp 50.000 - 1 Bulan', value: 50000 },
            { name: 'Rp 100.000 - 3 Bulan', value: 100000 },
            { name: 'Rp 200.000 - Lifetime', value: 200000 }
          )
      ),
    async execute(interaction) {
      try {
        await interaction.deferReply({ ephemeral: true });

        const discordId = interaction.user.id;
        const discordUsername = interaction.user.username;
        const amount = interaction.options.getInteger('amount');

        let user = await User.findOne({ discordId });

        if (!user) {
          user = new User({ discordId, discordUsername });
          await user.save();
        }

        // Generate unique order ID
        const orderId = `PREMIUM_${discordId}_${Date.now()}`;

        // Create payment invoice via Pakasir
        const payment = await paymentService.createInvoice({
          orderId: orderId,
          amount: amount,
          customerName: discordUsername,
          customerEmail: null,
          description: `Premium Key - ${discordUsername}`,
          discordId: discordId
        });

        if (!payment.success) {
          return await interaction.editReply({
            content: `❌ Gagal membuat invoice payment.\n\nError: ${payment.message}`
          });
        }

        const packageName = amount === 50000 ? '1 Bulan' : amount === 100000 ? '3 Bulan' : 'Lifetime';

        await interaction.editReply({
          content: `💳 **Payment Invoice Dibuat!**\n\n` +
            `📦 Paket: ${packageName}\n` +
            `💰 Harga: Rp ${amount.toLocaleString('id-ID')}\n` +
            `🆔 Order ID: \`${payment.orderId}\`\n` +
            `🆔 Invoice ID: \`${payment.invoiceId}\`\n\n` +
            `🔗 **Link Payment:**\n${payment.paymentUrl}\n\n` +
            `⏰ Invoice akan expired dalam 1 jam.\n` +
            `✅ Setelah pembayaran, premium key akan otomatis dikirim!`
        });
      } catch (error) {
        console.error('Error creating payment:', error);
        await interaction.editReply({
          content: '❌ Terjadi error saat membuat payment.'
        });
      }
    }
  }
};

module.exports = commands;
