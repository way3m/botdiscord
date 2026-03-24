const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log('Bot en ligne !');
});

client.on('messageCreate', message => {
  if (message.content === '!ping') {
    message.reply('pong 🏓');
  }
});

client.login(process.env.MTQ4NjExMDAyNDExMDQ0NDc5NQ.G9uyUq.5RGpknNDnb_51kPEgVBKNczOTtetMLtenCkv-s);
client.on('messageCreate', async message => {
  if (!message.guild) return;

  // KICK
  if (message.content.startsWith('!kick')) {
    if (!message.member.permissions.has('KickMembers')) {
      return message.reply("T'as pas la permission ❌");
    }

    const member = message.mentions.members.first();
    if (!member) return message.reply("Mentionne quelqu’un");

    await member.kick();
    message.channel.send(`${member.user.tag} a été kick 🥾`);
  }

  // BAN
  if (message.content.startsWith('!ban')) {
    if (!message.member.permissions.has('BanMembers')) {
      return message.reply("T'as pas la permission ❌");
    }

    const member = message.mentions.members.first();
    if (!member) return message.reply("Mentionne quelqu’un");

    await member.ban();
    message.channel.send(`${member.user.tag} a été ban 🔨`);
  }
});