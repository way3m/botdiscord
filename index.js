require('dotenv').config();
const fs = require('fs');
const http = require('http');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  SlashCommandBuilder
} = require('discord.js');

const prefix = '!';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const dataDir = path.join(__dirname, 'data');
const warningsFile = path.join(dataDir, 'warnings.json');
const settingsFile = path.join(dataDir, 'settings.json');

const eightBallReplies = [
  'Oui.',
  'Non.',
  'Peut-etre.',
  'Sans aucun doute.',
  'Je ne pense pas.',
  'Demande plus tard.',
  'Ca sent bon.',
  'Ca sent mauvais.'
];

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('Affiche l aide du bot'),
  new SlashCommandBuilder().setName('ping').setDescription('Affiche la latence du bot'),
  new SlashCommandBuilder().setName('botinfo').setDescription('Affiche les informations du bot'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Affiche les informations du serveur'),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Affiche les informations d un membre')
    .addUserOption(option =>
      option.setName('utilisateur').setDescription('Le membre a consulter').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Affiche l avatar d un membre')
    .addUserOption(option =>
      option.setName('utilisateur').setDescription('Le membre a consulter').setRequired(false)
    ),
  new SlashCommandBuilder().setName('config').setDescription('Affiche la configuration actuelle du bot'),
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ouvre un ticket de support')
    .addStringOption(option =>
      option.setName('raison').setDescription('La raison du ticket').setRequired(false)
    )
].map(command => command.toJSON());
function ensureJsonFile(filePath, defaultValue) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function readJsonFile(filePath, fallbackValue) {
  try {
    ensureJsonFile(filePath, fallbackValue);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Impossible de lire ${filePath}:`, error);
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  ensureJsonFile(filePath, value);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function getGuildSettings(guildId) {
  const settings = readJsonFile(settingsFile, {});
  return settings[guildId] || {};
}

function updateGuildSettings(guildId, nextSettings) {
  const settings = readJsonFile(settingsFile, {});
  settings[guildId] = {
    ...settings[guildId],
    ...nextSettings
  };
  writeJsonFile(settingsFile, settings);
}

function getGuildWarnings(guildId) {
  const warnings = readJsonFile(warningsFile, {});
  return warnings[guildId] || {};
}

function saveGuildWarnings(guildId, guildWarnings) {
  const warnings = readJsonFile(warningsFile, {});
  warnings[guildId] = guildWarnings;
  writeJsonFile(warningsFile, warnings);
}

function makeEmbed(title, description, color = COLORS.primary) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setFooter({ text: 'wayem bot suite' })
    .setTimestamp();

  if (description) {
    embed.setDescription(description);
  }

  return embed;
}

function errorEmbed(text) {
  return makeEmbed('Action impossible', text, COLORS.danger);
}

function successEmbed(text, title = 'Operation reussie') {
  return makeEmbed(title, text, COLORS.success);
}

function formatChannelSetting(guild, channelId) {
  if (!channelId) return '`Non configure`';
  const channel = guild.channels.cache.get(channelId);
  return channel ? `${channel}` : `Salon introuvable (${channelId})`;
}

function formatRoleSetting(guild, roleId) {
  if (!roleId) return '`Non configure`';
  const role = guild.roles.cache.get(roleId);
  return role ? `${role}` : `Role introuvable (${roleId})`;
}

function logEmbed(action, moderatorTag, targetTag, reason) {
  return makeEmbed(`Journal moderation | ${action}`, '', COLORS.warning).addFields(
    { name: 'Moderateur', value: moderatorTag, inline: true },
    { name: 'Cible', value: targetTag, inline: true },
    { name: 'Raison', value: reason || 'Aucune raison fournie', inline: false }
  );
}

function createHelpEmbed() {
  return makeEmbed(
    'Tableau de commandes',
    `Prefix actuel: \`${prefix}\`\nSlash commands disponibles aussi avec \`/\`.\n\nBot support, moderation et accueil.`,
    COLORS.primary
  ).addFields(
    {
      name: 'General',
      value: [
        '`!help`',
        '`!config`',
        '`!ping`',
        '`!hello`',
        '`!botinfo`',
        '`!serverinfo`',
        '`!userinfo [@user]`',
        '`!avatar [@user]`',
        '`!setwelcome #salon`'
      ].join('\n')
    },
    {
      name: 'Support',
      value: [
        '`!sendpanel`',
        '`!ticket [raison]`',
        '`!close`',
        '`!setcategory <id>`',
        '`!setstaffrole @role`',
        '`!settranscripts #salon`'
      ].join('\n')
    },
    {
      name: 'Moderation',
      value: [
        '`!clear <1-100>`',
        '`!kick @user [raison]`',
        '`!ban @user [raison]`',
        '`!unban <userId>`',
        '`!warn @user [raison]`',
        '`!warnings [@user]`',
        '`!unwarn @user <numero>`',
        '`!mute @user <minutes> [raison]`',
        '`!unmute @user`',
        '`!setlog #salon`',
        '`!say texte`',
        '`!lock`',
        '`!unlock`'
      ].join('\n')
    },
    {
      name: 'Fun',
      value: [
        '`!8ball question`',
        '`!poll Question | Choix 1 | Choix 2`'
      ].join('\n')
    }
  );
}

function createTicketPanel() {
  const embed = makeEmbed(
    'Support | Ouverture de ticket',
    [
      'Bienvenue dans le centre de support du serveur.',
      '',
      'Choisis la categorie qui correspond le mieux a ta demande pour ouvrir un ticket prive avec l equipe.',
      '',
      'Une fois le ticket cree, le staff sera notifie automatiquement.'
    ].join('\n'),
    COLORS.primary
  ).addFields(
    { name: '🛠️ Support', value: 'Question generale, aide ou probleme technique.', inline: false },
    { name: '🤝 Partenariat', value: 'Collaboration, projet ou proposition serieuse.', inline: false },
    { name: '🚨 Signalement', value: 'Incident, comportement ou contenu a remonter.', inline: false },
    { name: '⭐ Devenir staff', value: 'Candidature pour rejoindre l equipe du serveur.', inline: false }
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open_support')
      .setLabel('🛠️ Support')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ticket_open_partenariat')
      .setLabel('🤝 Partenariat')
      .setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open_signalement')
      .setLabel('🚨 Signalement')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('ticket_open_staff')
      .setLabel('⭐ Devenir staff')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function createTicketCloseButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Fermer le ticket')
      .setStyle(ButtonStyle.Danger)
  );
}

async function sendModLog(guild, embed) {
  const settings = getGuildSettings(guild.id);
  if (!settings.logChannelId) return;

  const logChannel = guild.channels.cache.get(settings.logChannelId);
  if (!logChannel || !logChannel.isTextBased()) return;

  await logChannel.send({ embeds: [embed] }).catch(() => null);
}

async function createTicketChannel(guild, user, reason) {
  const settings = getGuildSettings(guild.id);
  const existingTicket = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText && channel.topic === `ticket-owner:${user.id}`
  );

  if (existingTicket) {
    return { existingTicket };
  }

  const type = reason.type || 'support';
  const cleanBaseName = `ticket-${type}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 28);
  const ticketName = cleanBaseName || `ticket-${user.id}`;
  const parent = settings.ticketCategoryId ? guild.channels.cache.get(settings.ticketCategoryId) : null;
  const staffRoleId = settings.staffRoleId;
  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    },
    {
      id: client.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }
  ];

  if (staffRoleId) {
    permissionOverwrites.push({
      id: staffRoleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    });
  }

  const ticketChannel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: parent?.type === ChannelType.GuildCategory ? parent.id : null,
    topic: `ticket-owner:${user.id}`,
    permissionOverwrites
  });

  const embed = makeEmbed(
    'Ticket ouvert',
    `${user}, ton ticket a ete cree. Explique ton probleme clairement et le staff te repondra ici.`,
    COLORS.primary
  ).addFields(
    { name: 'Demandeur', value: user.tag, inline: true },
    { name: 'Type', value: type, inline: true },
    { name: 'Serveur', value: guild.name, inline: true },
    { name: 'Raison', value: reason.text, inline: false }
  ).setThumbnail(user.displayAvatarURL());

  const staffMention = staffRoleId ? `<@&${staffRoleId}>` : '';
  await ticketChannel.send({
    content: staffMention || undefined,
    embeds: [embed],
    components: [createTicketCloseButton()]
  });

  await sendModLog(guild, logEmbed('Ticket Open', user.tag, ticketChannel.name, `${type} | ${reason.text}`));

  return { ticketChannel };
}

async function buildTranscript(channel) {
  const fetchedMessages = await channel.messages.fetch({ limit: 100 });
  const orderedMessages = Array.from(fetchedMessages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = orderedMessages.map(message => {
    const createdAt = new Date(message.createdTimestamp).toLocaleString('fr-FR');
    const content = message.content || '[embed ou piece jointe]';
    return `[${createdAt}] ${message.author.tag}: ${content}`;
  });

  return lines.join('\n') || 'Aucun message dans le ticket.';
}

async function sendTicketTranscript(channel, closedByTag, reason) {
  const settings = getGuildSettings(channel.guild.id);
  const transcriptChannel = settings.transcriptChannelId
    ? channel.guild.channels.cache.get(settings.transcriptChannelId)
    : null;

  if (!transcriptChannel || !transcriptChannel.isTextBased()) {
    return;
  }

  const transcript = await buildTranscript(channel);
  const buffer = Buffer.from(transcript, 'utf8');
  const attachment = new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.txt` });

  await transcriptChannel.send({
    embeds: [
      makeEmbed('Transcript de ticket', '', COLORS.warning).addFields(
        { name: 'Salon', value: channel.name, inline: true },
        { name: 'Ferme par', value: closedByTag, inline: true },
        { name: 'Motif', value: reason, inline: false }
      )
    ],
    files: [attachment]
  }).catch(() => null);
}

client.once('clientReady', () => {
  console.log(`Connecte en tant que ${client.user.tag}`);
  client.application.commands.set(slashCommands)
    .then(() => console.log('Slash commands synchronisees.'))
    .catch(error => console.error('Erreur de synchronisation des slash commands:', error));
});

client.on('error', error => {
  console.error('Erreur client Discord:', error);
});

client.on('shardError', error => {
  console.error('Erreur shard Discord:', error);
});

client.on('warn', warning => {
  console.warn('Avertissement Discord:', warning);
});

client.on('debug', debug => {
  if (
    debug.includes('Provided token') ||
    debug.includes('Preparing to connect') ||
    debug.includes('Gateway') ||
    debug.includes('Heartbeat') ||
    debug.includes('Session')
  ) {
    console.log('Debug Discord:', debug);
  }
});

client.on('shardReady', shardId => {
  console.log(`Shard prete: ${shardId}`);
});

client.on('shardDisconnect', (event, shardId) => {
  console.error(`Shard deconnectee: ${shardId} code=${event.code}`);
});

client.on('shardReconnecting', shardId => {
  console.warn(`Shard en reconnexion: ${shardId}`);
});

client.on('shardResume', (replayedEvents, shardId) => {
  console.log(`Shard resumee: ${shardId} events=${replayedEvents}`);
});

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', bot: client.user?.tag || 'starting' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Bot Discord en ligne');
});

server.listen(port, () => {
  console.log(`Serveur web actif sur le port ${port}`);
  console.log(`Diagnostic TOKEN: present=${Boolean(process.env.TOKEN)} length=${process.env.TOKEN ? process.env.TOKEN.length : 0}`);
});

client.on('guildMemberAdd', async member => {
  const settings = getGuildSettings(member.guild.id);
  if (!settings.welcomeChannelId) return;

  const welcomeChannel = member.guild.channels.cache.get(settings.welcomeChannelId);
  if (!welcomeChannel || !welcomeChannel.isTextBased()) return;

  const embed = makeEmbed(
    `Bienvenue sur ${member.guild.name}`,
    `${member}, nous sommes contents de te voir arriver. Passe un bon moment sur le serveur.`,
    COLORS.primary
  ).addFields(
    { name: 'Membre', value: member.user.tag, inline: true },
    { name: 'Effectif', value: `${member.guild.memberCount} membres`, inline: true },
    { name: 'Arrivee', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
  ).setThumbnail(member.user.displayAvatarURL());

  await welcomeChannel.send({ embeds: [embed] }).catch(() => null);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'help') {
        await interaction.reply({ embeds: [createHelpEmbed()] });
        return;
      }

      if (interaction.commandName === 'ping') {
        const apiLatency = Math.round(client.ws.ping);
        await interaction.reply({
          embeds: [
            makeEmbed('Latence du bot', '', COLORS.primary).addFields(
              { name: 'API Discord', value: `${apiLatency} ms`, inline: true }
            )
          ]
        });
        return;
      }

      if (interaction.commandName === 'botinfo') {
        await interaction.reply({
          embeds: [
            makeEmbed('Informations du bot', '', COLORS.primary)
              .setThumbnail(client.user.displayAvatarURL())
              .addFields(
                { name: 'Nom', value: client.user.username, inline: true },
                { name: 'Serveurs', value: `${client.guilds.cache.size}`, inline: true },
                { name: 'Ping API', value: `${Math.round(client.ws.ping)} ms`, inline: true }
              )
          ]
        });
        return;
      }

      if (interaction.commandName === 'serverinfo') {
        if (!interaction.guild) {
          await interaction.reply({ embeds: [errorEmbed('Cette commande doit etre utilisee dans un serveur.')], ephemeral: true });
          return;
        }

        await interaction.reply({
          embeds: [
            makeEmbed(`Serveur | ${interaction.guild.name}`, '', COLORS.primary)
              .setThumbnail(interaction.guild.iconURL() || null)
              .addFields(
                { name: 'Membres', value: `${interaction.guild.memberCount}`, inline: true },
                { name: 'Salons', value: `${interaction.guild.channels.cache.size}`, inline: true },
                { name: 'Creation', value: `<t:${Math.floor(interaction.guild.createdTimestamp / 1000)}:F>`, inline: false }
              )
          ]
        });
        return;
      }

      if (interaction.commandName === 'userinfo') {
        if (!interaction.guild) {
          await interaction.reply({ embeds: [errorEmbed('Cette commande doit etre utilisee dans un serveur.')], ephemeral: true });
          return;
        }

        const targetUser = interaction.options.getUser('utilisateur');
        const member = targetUser
          ? await interaction.guild.members.fetch(targetUser.id).catch(() => null)
          : interaction.member;

        if (!member) {
          await interaction.reply({ embeds: [errorEmbed('Utilisateur introuvable sur ce serveur.')], ephemeral: true });
          return;
        }

        const roles = member.roles.cache
          .filter(role => role.id !== interaction.guild.id)
          .map(role => role.name)
          .slice(0, 10)
          .join(', ') || 'Aucun role';

        await interaction.reply({
          embeds: [
            makeEmbed(`Profil | ${member.user.tag}`, '', COLORS.primary)
              .setThumbnail(member.user.displayAvatarURL())
              .addFields(
                { name: 'ID', value: member.id, inline: false },
                { name: 'Compte cree', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`, inline: false },
                { name: 'A rejoint', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false },
                { name: 'Roles', value: roles, inline: false }
              )
          ]
        });
        return;
      }

      if (interaction.commandName === 'avatar') {
        const user = interaction.options.getUser('utilisateur') || interaction.user;
        await interaction.reply({
          embeds: [
            makeEmbed(`Avatar | ${user.tag}`, '', COLORS.primary)
              .setImage(user.displayAvatarURL({ size: 1024 }))
          ]
        });
        return;
      }

      if (interaction.commandName === 'config') {
        if (!interaction.guild) {
          await interaction.reply({ embeds: [errorEmbed('Cette commande doit etre utilisee dans un serveur.')], ephemeral: true });
          return;
        }

        const settings = getGuildSettings(interaction.guild.id);
        const embed = makeEmbed(
          'Configuration du bot',
          'Voici l etat actuel de la configuration sur ce serveur.',
          COLORS.primary
        ).addFields(
          { name: 'Accueil', value: formatChannelSetting(interaction.guild, settings.welcomeChannelId), inline: true },
          { name: 'Logs moderation', value: formatChannelSetting(interaction.guild, settings.logChannelId), inline: true },
          { name: 'Categorie tickets', value: formatChannelSetting(interaction.guild, settings.ticketCategoryId), inline: true },
          { name: 'Role staff', value: formatRoleSetting(interaction.guild, settings.staffRoleId), inline: true },
          { name: 'Transcripts tickets', value: formatChannelSetting(interaction.guild, settings.transcriptChannelId), inline: true }
        );

        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (interaction.commandName === 'ticket') {
        if (!interaction.guild) {
          await interaction.reply({ embeds: [errorEmbed('Cette commande doit etre utilisee dans un serveur.')], ephemeral: true });
          return;
        }

        const reason = interaction.options.getString('raison') || 'Aucune raison fournie';
        const { ticketChannel, existingTicket } = await createTicketChannel(interaction.guild, interaction.user, {
          type: 'support',
          text: reason
        });

        if (existingTicket) {
          await interaction.reply({ embeds: [errorEmbed(`Tu as deja un ticket ouvert: ${existingTicket}.`)], ephemeral: true });
          return;
        }

        await interaction.reply({
          embeds: [successEmbed(`Ton ticket est pret: ${ticketChannel}.`, 'Ticket cree')],
          ephemeral: true
        });
        return;
      }
    }

    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith('ticket_open_')) {
      if (!interaction.guild) {
        await interaction.reply({ embeds: [errorEmbed('Cette action doit etre utilisee dans un serveur.')], ephemeral: true });
        return;
      }

      const ticketType = interaction.customId.replace('ticket_open_', '');
      const { ticketChannel, existingTicket } = await createTicketChannel(
        interaction.guild,
        interaction.user,
        {
          type: ticketType,
          text: 'Ouvert depuis le panel'
        }
      );

      if (existingTicket) {
        await interaction.reply({
          embeds: [errorEmbed(`Tu as deja un ticket ouvert: ${existingTicket}.`)],
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        embeds: [successEmbed(`Ton ticket est pret: ${ticketChannel}.`, 'Ticket cree')],
        ephemeral: true
      });
      return;
    }

    if (interaction.customId === 'ticket_close') {
      if (!interaction.guild || !interaction.channel) {
        await interaction.reply({ embeds: [errorEmbed('Impossible de fermer ce ticket ici.')], ephemeral: true });
        return;
      }

      if (!interaction.channel.topic || !interaction.channel.topic.startsWith('ticket-owner:')) {
        await interaction.reply({ embeds: [errorEmbed('Ce bouton fonctionne uniquement dans un ticket.')], ephemeral: true });
        return;
      }

      const ownerId = interaction.channel.topic.replace('ticket-owner:', '');
      const canClose =
        interaction.user.id === ownerId ||
        interaction.member.permissions?.has(PermissionsBitField.Flags.ManageChannels);

      if (!canClose) {
        await interaction.reply({
          embeds: [errorEmbed('Seul le createur du ticket ou le staff peut le fermer.')],
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        embeds: [successEmbed('Le ticket sera ferme dans 3 secondes.', 'Fermeture en cours')]
      });

      await sendTicketTranscript(interaction.channel, interaction.user.tag, 'Fermeture via bouton');
      await sendModLog(
        interaction.guild,
        logEmbed('Ticket Close', interaction.user.tag, interaction.channel.name, 'Fermeture via bouton')
      );

      setTimeout(() => {
        interaction.channel.delete().catch(() => null);
      }, 3000);
    }
  } catch (error) {
    console.error('Erreur sur une interaction:', error);

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        embeds: [errorEmbed('Une erreur est survenue pendant l action.')],
        ephemeral: true
      }).catch(() => null);
      return;
    }

    await interaction.reply({
      embeds: [errorEmbed('Une erreur est survenue pendant l action.')],
      ephemeral: true
    }).catch(() => null);
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  if (!command) return;

  try {
    if (command === 'help') {
      await message.channel.send({ embeds: [createHelpEmbed()] });
      return;
    }

    if (command === 'config') {
      if (!message.guild) {
        await message.reply({ embeds: [errorEmbed('Cette commande doit etre utilisee dans un serveur.')] });
        return;
      }

      const settings = getGuildSettings(message.guild.id);
      const embed = makeEmbed(
        'Configuration du bot',
        'Voici l etat actuel de la configuration sur ce serveur.',
        COLORS.primary
      ).addFields(
        { name: 'Accueil', value: formatChannelSetting(message.guild, settings.welcomeChannelId), inline: true },
        { name: 'Logs moderation', value: formatChannelSetting(message.guild, settings.logChannelId), inline: true },
        { name: 'Categorie tickets', value: formatChannelSetting(message.guild, settings.ticketCategoryId), inline: true },
        { name: 'Role staff', value: formatRoleSetting(message.guild, settings.staffRoleId), inline: true },
        { name: 'Transcripts tickets', value: formatChannelSetting(message.guild, settings.transcriptChannelId), inline: true },
        {
          name: 'Commandes de setup',
          value: [
            '`!setwelcome #salon`',
            '`!setlog #salon`',
            '`!setcategory <id>`',
            '`!setstaffrole @role`',
            '`!settranscripts #salon`',
            '`!sendpanel`'
          ].join('\n'),
          inline: false
        }
      );

      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (command === 'ping') {
      const sent = await message.reply({ embeds: [makeEmbed('Analyse de latence', 'Mesure en cours...', COLORS.primary)] });
      const apiLatency = Math.round(client.ws.ping);
      const botLatency = sent.createdTimestamp - message.createdTimestamp;

      await sent.edit({
        embeds: [
          makeEmbed('Latence du bot', '', COLORS.primary).addFields(
            { name: 'Bot', value: `${botLatency} ms`, inline: true },
            { name: 'API Discord', value: `${apiLatency} ms`, inline: true }
          )
        ]
      });
      return;
    }

    if (command === 'hello') {
      await message.reply({
        embeds: [successEmbed(`Salut ${message.author}. Tout est operationnel.`, 'Connexion etablie')]
      });
      return;
    }

    if (command === 'botinfo') {
      await message.channel.send({
        embeds: [
          makeEmbed('Informations du bot', '', COLORS.primary)
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
              { name: 'Nom', value: client.user.username, inline: true },
              { name: 'Serveurs', value: `${client.guilds.cache.size}`, inline: true },
              { name: 'Ping API', value: `${Math.round(client.ws.ping)} ms`, inline: true }
            )
        ]
      });
      return;
    }

    if (command === 'serverinfo') {
      if (!message.guild) {
        await message.reply({ embeds: [errorEmbed('Cette commande doit etre utilisee dans un serveur.')] });
        return;
      }

      await message.channel.send({
        embeds: [
          makeEmbed(`Serveur | ${message.guild.name}`, '', COLORS.primary)
            .setThumbnail(message.guild.iconURL() || null)
            .addFields(
              { name: 'Membres', value: `${message.guild.memberCount}`, inline: true },
              { name: 'Salons', value: `${message.guild.channels.cache.size}`, inline: true },
              { name: 'Creation', value: `<t:${Math.floor(message.guild.createdTimestamp / 1000)}:F>`, inline: false }
            )
        ]
      });
      return;
    }

    if (command === 'userinfo') {
      if (!message.guild) {
        await message.reply({ embeds: [errorEmbed('Cette commande doit etre utilisee dans un serveur.')] });
        return;
      }

      const member = message.mentions.members.first() || message.member;
      const roles = member.roles.cache
        .filter(role => role.id !== message.guild.id)
        .map(role => role.name)
        .slice(0, 10)
        .join(', ') || 'Aucun role';

      await message.channel.send({
        embeds: [
          makeEmbed(`Profil | ${member.user.tag}`, '', COLORS.primary)
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
              { name: 'ID', value: member.id, inline: false },
              { name: 'Compte cree', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`, inline: false },
              { name: 'A rejoint', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false },
              { name: 'Roles', value: roles, inline: false }
            )
        ]
      });
      return;
    }

    if (command === 'avatar') {
      const user = message.mentions.users.first() || message.author;
      await message.channel.send({
        embeds: [
          makeEmbed(`Avatar | ${user.tag}`, '', COLORS.primary)
            .setImage(user.displayAvatarURL({ size: 1024 }))
        ]
      });
      return;
    }

    if (command === 'setwelcome') {
      if (!message.guild || !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `Administrator`.")] });
        return;
      }

      const channel = message.mentions.channels.first();
      if (!channel || !channel.isTextBased()) {
        await message.reply({ embeds: [errorEmbed('Mentionne un salon textuel pour le message d accueil.')] });
        return;
      }

      updateGuildSettings(message.guild.id, { welcomeChannelId: channel.id });
      await message.channel.send({
        embeds: [successEmbed(`Le salon d accueil est maintenant ${channel}.`, 'Accueil configure')]
      });
      return;
    }

    if (command === 'sendpanel') {
      if (!message.guild || !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `Administrator`.")] });
        return;
      }

      await message.channel.send(createTicketPanel());
      await message.reply({
        embeds: [successEmbed('Le panel de tickets a ete publie dans ce salon.', 'Panel envoye')]
      });
      return;
    }

    if (command === 'setstaffrole') {
      if (!message.guild || !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `Administrator`.")] });
        return;
      }

      const role = message.mentions.roles.first();
      if (!role) {
        await message.reply({ embeds: [errorEmbed('Mentionne un role staff valide.')] });
        return;
      }

      updateGuildSettings(message.guild.id, { staffRoleId: role.id });
      await message.channel.send({
        embeds: [successEmbed(`Le role staff est maintenant ${role}.`, 'Role staff configure')]
      });
      return;
    }

    if (command === 'settranscripts') {
      if (!message.guild || !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `Administrator`.")] });
        return;
      }

      const channel = message.mentions.channels.first();
      if (!channel || !channel.isTextBased()) {
        await message.reply({ embeds: [errorEmbed('Mentionne un salon textuel pour les transcripts.')] });
        return;
      }

      updateGuildSettings(message.guild.id, { transcriptChannelId: channel.id });
      await message.channel.send({
        embeds: [successEmbed(`Le salon de transcripts est maintenant ${channel}.`, 'Transcripts configures')]
      });
      return;
    }

    if (command === '8ball') {
      const question = args.join(' ');
      if (!question) {
        await message.reply({ embeds: [errorEmbed('Pose une question apres `!8ball`.')] });
        return;
      }

      const answer = eightBallReplies[Math.floor(Math.random() * eightBallReplies.length)];
      await message.reply({
        embeds: [
          makeEmbed('Oracle 8ball', '', COLORS.primary).addFields(
            { name: 'Question', value: question, inline: false },
            { name: 'Reponse', value: answer, inline: false }
          )
        ]
      });
      return;
    }

    if (command === 'poll') {
      const parts = message.content
        .slice(prefix.length + command.length)
        .split('|')
        .map(part => part.trim())
        .filter(Boolean);

      if (parts.length < 3) {
        await message.reply({
          embeds: [errorEmbed('Utilisation: `!poll Question | Choix 1 | Choix 2` avec jusqu a 10 choix.')]
        });
        return;
      }

      if (parts.length > 11) {
        await message.reply({ embeds: [errorEmbed('Maximum 10 choix pour un sondage.')] });
        return;
      }

      const [question, ...choices] = parts;
      const description = choices.map((choice, index) => `${index + 1}. ${choice}`).join('\n');

      await message.channel.send({
        embeds: [
          makeEmbed('Sondage en cours', `**${question}**\n\n${description}`, COLORS.primary)
            .addFields({ name: 'Cree par', value: message.author.tag, inline: true })
        ]
      });
      return;
    }

    if (!message.guild || !message.member) {
      await message.reply({ embeds: [errorEmbed('Cette commande doit etre utilisee dans un serveur.')] });
      return;
    }

    if (command === 'ticket') {
      const reason = args.join(' ') || 'Aucune raison fournie';
      const { ticketChannel, existingTicket } = await createTicketChannel(message.guild, message.author, {
        type: 'support',
        text: reason
      });

      if (existingTicket) {
        await message.reply({ embeds: [errorEmbed(`Tu as deja un ticket ouvert: ${existingTicket}.`)] });
        return;
      }

      await message.reply({
        embeds: [successEmbed(`Ton ticket est pret: ${ticketChannel}.`, 'Ticket cree')]
      });
      return;
    }

    if (command === 'close') {
      if (!message.channel.topic || !message.channel.topic.startsWith('ticket-owner:')) {
        await message.reply({ embeds: [errorEmbed('Cette commande fonctionne uniquement dans un ticket.')] });
        return;
      }

      const ownerId = message.channel.topic.replace('ticket-owner:', '');
      const canClose =
        message.author.id === ownerId ||
        message.member.permissions.has(PermissionsBitField.Flags.ManageChannels);

      if (!canClose) {
        await message.reply({ embeds: [errorEmbed('Seul le createur du ticket ou le staff peut le fermer.')] });
        return;
      }

      await message.channel.send({
        embeds: [successEmbed('Le ticket sera ferme dans 3 secondes.', 'Fermeture en cours')]
      });

      await sendTicketTranscript(message.channel, message.author.tag, 'Fermeture via commande');
      await sendModLog(
        message.guild,
        logEmbed('Ticket Close', message.author.tag, message.channel.name, 'Fermeture via commande')
      );

      setTimeout(() => {
        message.channel.delete().catch(() => null);
      }, 3000);
      return;
    }

    if (command === 'setcategory') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `Administrator`.")] });
        return;
      }

      const categoryId = args[0];
      const category = categoryId ? message.guild.channels.cache.get(categoryId) : null;
      if (!category || category.type !== ChannelType.GuildCategory) {
        await message.reply({ embeds: [errorEmbed('Donne l ID d une categorie valide pour les tickets.')] });
        return;
      }

      updateGuildSettings(message.guild.id, { ticketCategoryId: category.id });
      await message.channel.send({
        embeds: [successEmbed(`La categorie tickets est maintenant **${category.name}**.`, 'Categorie definie')]
      });
      return;
    }

    if (command === 'clear') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `ManageMessages`.")] });
        return;
      }

      const amount = Number.parseInt(args[0], 10);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
        await message.reply({ embeds: [errorEmbed('Donne un nombre entre 1 et 100.')] });
        return;
      }

      const deleted = await message.channel.bulkDelete(amount, true);
      const reply = await message.channel.send({
        embeds: [successEmbed(`${deleted.size} message(s) ont ete supprimes.`, 'Nettoyage termine')]
      });

      await sendModLog(
        message.guild,
        logEmbed('Clear', message.author.tag, `${deleted.size} messages`, `Salon: #${message.channel.name}`)
      );

      setTimeout(() => {
        reply.delete().catch(() => null);
      }, 3000);
      return;
    }

    if (command === 'kick') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `KickMembers`.")] });
        return;
      }

      const member = message.mentions.members.first();
      const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
      if (!member) {
        await message.reply({ embeds: [errorEmbed('Mentionne un utilisateur a expulser.')] });
        return;
      }

      if (!member.kickable) {
        await message.reply({ embeds: [errorEmbed('Je ne peux pas expulser ce membre.')] });
        return;
      }

      await member.kick(reason);
      await message.channel.send({
        embeds: [successEmbed(`${member.user.tag} a ete expulse.\nRaison: ${reason}`, 'Membre expulse')]
      });
      await sendModLog(message.guild, logEmbed('Kick', message.author.tag, member.user.tag, reason));
      return;
    }

    if (command === 'ban') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `BanMembers`.")] });
        return;
      }

      const member = message.mentions.members.first();
      const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
      if (!member) {
        await message.reply({ embeds: [errorEmbed('Mentionne un utilisateur a bannir.')] });
        return;
      }

      if (!member.bannable) {
        await message.reply({ embeds: [errorEmbed('Je ne peux pas bannir ce membre.')] });
        return;
      }

      await member.ban({ reason });
      await message.channel.send({
        embeds: [successEmbed(`${member.user.tag} a ete banni.\nRaison: ${reason}`, 'Membre banni')]
      });
      await sendModLog(message.guild, logEmbed('Ban', message.author.tag, member.user.tag, reason));
      return;
    }

    if (command === 'unban') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `BanMembers`.")] });
        return;
      }

      const userId = args[0];
      if (!userId) {
        await message.reply({ embeds: [errorEmbed('Donne l ID utilisateur a debannir.')] });
        return;
      }

      await message.guild.members.unban(userId);
      await message.channel.send({
        embeds: [successEmbed(`L utilisateur ${userId} a ete debanni.`, 'Deban effectue')]
      });
      await sendModLog(message.guild, logEmbed('Unban', message.author.tag, userId, 'Debannissement manuel'));
      return;
    }

    if (command === 'warn') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `ModerateMembers`.")] });
        return;
      }

      const member = message.mentions.members.first();
      const reason = args.slice(1).join(' ') || 'Aucune raison fournie';
      if (!member) {
        await message.reply({ embeds: [errorEmbed('Mentionne un utilisateur a avertir.')] });
        return;
      }

      const guildWarnings = getGuildWarnings(message.guild.id);
      const userWarnings = guildWarnings[member.id] || [];
      userWarnings.push({
        reason,
        moderator: message.author.tag,
        createdAt: new Date().toISOString()
      });
      guildWarnings[member.id] = userWarnings;
      saveGuildWarnings(message.guild.id, guildWarnings);

      await message.channel.send({
        embeds: [successEmbed(`${member.user.tag} a recu un avertissement.\nTotal actuel: ${userWarnings.length}.`, 'Avertissement ajoute')]
      });
      await sendModLog(message.guild, logEmbed('Warn', message.author.tag, member.user.tag, reason));
      return;
    }

    if (command === 'warnings') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `ModerateMembers`.")] });
        return;
      }

      const member = message.mentions.members.first() || message.member;
      const guildWarnings = getGuildWarnings(message.guild.id);
      const userWarnings = guildWarnings[member.id] || [];

      if (userWarnings.length === 0) {
        await message.channel.send({
          embeds: [successEmbed(`${member.user.tag} n a aucun avertissement.`, 'Dossier propre')]
        });
        return;
      }

      await message.channel.send({
        embeds: [
          makeEmbed(`Historique des avertissements | ${member.user.tag}`, '', COLORS.warning).setDescription(
            userWarnings
              .map((warning, index) => {
                const timestamp = Math.floor(new Date(warning.createdAt).getTime() / 1000);
                return `**${index + 1}.** ${warning.reason}\nModerateur: ${warning.moderator}\nDate: <t:${timestamp}:F>`;
              })
              .join('\n\n')
          )
        ]
      });
      return;
    }

    if (command === 'unwarn') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `ModerateMembers`.")] });
        return;
      }

      const member = message.mentions.members.first();
      const index = Number.parseInt(args[1], 10);
      if (!member) {
        await message.reply({ embeds: [errorEmbed('Mentionne un utilisateur.')] });
        return;
      }

      if (!Number.isInteger(index) || index < 1) {
        await message.reply({ embeds: [errorEmbed('Donne le numero de l avertissement a retirer.')] });
        return;
      }

      const guildWarnings = getGuildWarnings(message.guild.id);
      const userWarnings = guildWarnings[member.id] || [];
      if (!userWarnings[index - 1]) {
        await message.reply({ embeds: [errorEmbed('Cet avertissement n existe pas.')] });
        return;
      }

      const [removedWarning] = userWarnings.splice(index - 1, 1);
      guildWarnings[member.id] = userWarnings;
      saveGuildWarnings(message.guild.id, guildWarnings);

      await message.channel.send({
        embeds: [successEmbed(`Avertissement ${index} retire pour ${member.user.tag}.`, 'Avertissement retire')]
      });
      await sendModLog(message.guild, logEmbed('Unwarn', message.author.tag, member.user.tag, removedWarning.reason));
      return;
    }

    if (command === 'mute') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `ModerateMembers`.")] });
        return;
      }

      const member = message.mentions.members.first();
      const minutes = Number.parseInt(args[1], 10);
      const reason = args.slice(2).join(' ') || 'Aucune raison fournie';
      if (!member) {
        await message.reply({ embeds: [errorEmbed('Mentionne un utilisateur a mute.')] });
        return;
      }

      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320) {
        await message.reply({ embeds: [errorEmbed('Donne une duree en minutes entre 1 et 40320.')] });
        return;
      }

      if (!member.moderatable) {
        await message.reply({ embeds: [errorEmbed('Je ne peux pas mettre ce membre en timeout.')] });
        return;
      }

      await member.timeout(minutes * 60 * 1000, reason);
      await message.channel.send({
        embeds: [successEmbed(`${member.user.tag} a ete mute pour ${minutes} minute(s).\nRaison: ${reason}`, 'Timeout applique')]
      });
      await sendModLog(message.guild, logEmbed('Mute', message.author.tag, member.user.tag, `${reason} | ${minutes} minute(s)`));
      return;
    }

    if (command === 'unmute') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `ModerateMembers`.")] });
        return;
      }

      const member = message.mentions.members.first();
      if (!member) {
        await message.reply({ embeds: [errorEmbed('Mentionne un utilisateur a unmute.')] });
        return;
      }

      if (!member.moderatable) {
        await message.reply({ embeds: [errorEmbed('Je ne peux pas retirer le timeout de ce membre.')] });
        return;
      }

      await member.timeout(null);
      await message.channel.send({
        embeds: [successEmbed(`${member.user.tag} n est plus mute.`, 'Timeout retire')]
      });
      await sendModLog(message.guild, logEmbed('Unmute', message.author.tag, member.user.tag, 'Timeout retire'));
      return;
    }

    if (command === 'setlog') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `Administrator`.")] });
        return;
      }

      const channel = message.mentions.channels.first();
      if (!channel || !channel.isTextBased()) {
        await message.reply({ embeds: [errorEmbed('Mentionne un salon textuel pour les logs.')] });
        return;
      }

      updateGuildSettings(message.guild.id, { logChannelId: channel.id });
      await message.channel.send({
        embeds: [successEmbed(`Le salon de logs est maintenant ${channel}.`, 'Logs configures')]
      });
      return;
    }

    if (command === 'say') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `ManageMessages`.")] });
        return;
      }

      const text = args.join(' ');
      if (!text) {
        await message.reply({ embeds: [errorEmbed('Ecris un message apres `!say`.')] });
        return;
      }

      await message.delete().catch(() => null);
      await message.channel.send(text);
      return;
    }

    if (command === 'lock' || command === 'unlock') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        await message.reply({ embeds: [errorEmbed("Tu n as pas la permission `ManageChannels`.")] });
        return;
      }

      if (message.channel.type !== ChannelType.GuildText) {
        await message.reply({ embeds: [errorEmbed('Cette commande fonctionne seulement dans un salon textuel classique.')] });
        return;
      }

      const everyoneRole = message.guild.roles.everyone;
      const canSend = command === 'unlock';

      await message.channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: canSend
      });

      await message.channel.send({
        embeds: [
          successEmbed(
            canSend ? 'Le salon est de nouveau ouvert a tous.' : 'Le salon est maintenant reserve au staff.',
            canSend ? 'Salon deverrouille' : 'Salon verrouille'
          )
        ]
      });

      await sendModLog(
        message.guild,
        logEmbed(canSend ? 'Unlock' : 'Lock', message.author.tag, `#${message.channel.name}`, 'Modification des permissions')
      );
      return;
    }

    await message.reply({ embeds: [errorEmbed('Commande inconnue. Fais `!help` pour voir la liste.')] });
  } catch (error) {
    console.error(`Erreur sur la commande ${command}:`, error);
    await message.reply({
      embeds: [errorEmbed('Une erreur est survenue pendant l execution de la commande.')]
    }).catch(() => null);
  }
});

if (!process.env.TOKEN) {
  console.error('La variable TOKEN est manquante dans le fichier .env');
  process.exit(1);
}

console.log('Tentative de connexion a Discord...');
client.login(process.env.TOKEN).catch(error => {
  console.error('Erreur lors de la connexion du bot a Discord:', error);
});
