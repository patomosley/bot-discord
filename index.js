// Importa as bibliotecas necessárias
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, 
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuração do bot usando variáveis de ambiente
const config = {
  token: process.env.TOKEN, // Usar variável de ambiente para o token
  guildId: process.env.GUILD_ID || '1346841875218436158',
  staffRoleId: process.env.STAFF_ROLE_ID || '1369035522596536340',
  categoryId: process.env.CATEGORY_ID || '1369030401045037217',
  ticketLogChannelId: process.env.LOG_CHANNEL_ID || '1369035065551487047',
};

// Categorias de suporte
const categorias = {
  suporte: {
    id: 'suporte',
    nome: 'Suporte',
    emoji: '🔧',
    cor: '#ff5555',
    imagem: 'https://i.imgur.com/exemplo_suporte.png', // Substitua com URL da imagem
    descricao: 'Solicite ajuda com problemas técnicos gerais'
  },
  sistema: {
    id: 'sistema',
    nome: 'Sistema',
    emoji: '💻',
    cor: '#55ff55',
    imagem: 'https://i.imgur.com/exemplo_sistema.png', // Substitua com URL da imagem
    descricao: 'Problemas relacionados ao nosso sistema'
  },
  mikrotik: {
    id: 'mikrotik',
    nome: 'Mikrotik',
    emoji: '📡',
    cor: '#5555ff',
    imagem: 'https://i.imgur.com/exemplo_mikrotik.png', // Substitua com URL da imagem
    descricao: 'Suporte específico para equipamentos Mikrotik'
  },
  duvida: {
    id: 'duvida',
    nome: 'Dúvida',
    emoji: '❓',
    cor: '#ffff55',
    imagem: 'https://i.imgur.com/exemplo_duvida.png', // Substitua com URL da imagem
    descricao: 'Tire suas dúvidas sobre nossos serviços'
  },
  outros: {
    id: 'outros',
    nome: 'Outros',
    emoji: '📌',
    cor: '#ff55ff',
    imagem: 'https://i.imgur.com/exemplo_outros.png', // Substitua com URL da imagem
    descricao: 'Outros assuntos não listados nas categorias acima'
  }
};

// Mapa para armazenar as transcrições de tickets ativos
const ticketTranscripts = new Map();

// Inicializa o cliente Discord com as intents necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Evento executado quando o bot estiver pronto
client.on('ready', async () => {
  console.log(`Bot conectado como ${client.user.tag}`);
  
  // Registra comandos de barra (/)
  const guild = client.guilds.cache.get(config.guildId);
  if (!guild) return console.error('Servidor não encontrado');
  
  try {
    await guild.commands.set([
      {
        name: 'setup',
        description: 'Configura o sistema de tickets',
        options: [
          {
            name: 'canal',
            description: 'Canal onde será enviada a mensagem de criação de tickets',
            type: 7,
            required: true
          }
        ]
      },
      {
        name: 'fechar',
        description: 'Fecha um ticket atual'
      }
    ]);
    
    console.log('Comandos registrados com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

// Manipulador de comandos de barra (/)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  
  const { commandName, options } = interaction;
  
  if (commandName === 'setup') {
    // Verifica permissões
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Você não tem permissão para usar este comando.', ephemeral: true });
    }
    
    const channel = options.getChannel('canal');
    
    // Cria a mensagem de tickets com botões para cada categoria
    await createTicketMessage(channel);
    await interaction.reply({ content: `✅ Sistema de tickets configurado no canal ${channel}!`, ephemeral: true });
  }
  
  if (commandName === 'fechar') {
    // Verifica se é um canal de ticket
    if (!interaction.channel.name.startsWith('ticket-')) {
      return interaction.reply({ content: '❌ Este comando só pode ser usado em canais de ticket.', ephemeral: true });
    }
    
    await interaction.reply({ content: 'Fechando ticket em 5 segundos...' });
    setTimeout(() => closeTicket(interaction.channel, interaction.user), 5000);
  }
});

// Manipulador de interações com botões e modais
client.on('interactionCreate', async (interaction) => {
  // Processa interações com botões
  if (interaction.isButton()) {
    // Botões para criar tickets por categoria
    if (interaction.customId.startsWith('ticket_create_')) {
      const categoryId = interaction.customId.replace('ticket_create_', '');
      const category = categorias[categoryId];
      
      if (!category) return;
      
      // Verifica se o usuário já tem um ticket aberto
      const guild = interaction.guild;
      const existingTicket = guild.channels.cache.find(
        ch => ch.name === `ticket-${interaction.user.username.toLowerCase().replace(/\s+/g, '-')}` && 
             ch.parentId === config.categoryId
      );
      
      if (existingTicket) {
        return interaction.reply({ 
          content: `❌ Você já tem um ticket aberto em ${existingTicket}`, 
          ephemeral: true 
        });
      }
      
      // Abre o modal para descrição do problema
      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${categoryId}`)
        .setTitle(`Novo Ticket - ${category.nome}`);
      
      const descricaoInput = new TextInputBuilder()
        .setCustomId('descricao')
        .setLabel('Descreva seu problema')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Forneça detalhes sobre sua solicitação...')
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(1000);
      
      const firstActionRow = new ActionRowBuilder().addComponents(descricaoInput);
      modal.addComponents(firstActionRow);
      
      await interaction.showModal(modal);
    }
    
    // Botão para fechar ticket
    if (interaction.customId === 'ticket_close') {
      await interaction.reply({ content: 'Fechando ticket em 5 segundos...' });
      setTimeout(() => closeTicket(interaction.channel, interaction.user), 5000);
    }
  }
  
  // Processa envios de modal
  if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
    const categoryId = interaction.customId.replace('ticket_modal_', '');
    const category = categorias[categoryId];
    const descricao = interaction.fields.getTextInputValue('descricao');
    
    await interaction.reply({ content: '🔄 Criando seu ticket, aguarde um momento...', ephemeral: true });
    
    // Cria o canal de texto do ticket
    const ticketChannel = await createTicketChannel(interaction, category, descricao);
    
    if (ticketChannel) {
      // Inicia uma transcrição vazia para este ticket
      ticketTranscripts.set(ticketChannel.id, []);
      
      // Criar canal de voz privado
      const voiceChannel = await createTicketVoiceChannel(interaction, category);
      
      // Atualiza a mensagem
      await interaction.editReply({ 
        content: `✅ Seu ticket foi criado em ${ticketChannel}! Uma sala de voz privada também foi criada em ${voiceChannel}.`, 
        ephemeral: true 
      });
    } else {
      await interaction.editReply({ 
        content: '❌ Ocorreu um erro ao criar seu ticket. Por favor, tente novamente mais tarde.', 
        ephemeral: true 
      });
    }
  }
});

// Registra mensagens para transcrição
client.on('messageCreate', async (message) => {
  // Ignora mensagens do bot
  if (message.author.bot) return;
  
  // Verifica se é um canal de ticket
  if (message.channel.name.startsWith('ticket-') && message.channel.parentId === config.categoryId) {
    // Adiciona a mensagem à transcrição
    const transcript = ticketTranscripts.get(message.channel.id) || [];
    transcript.push({
      author: message.author.tag,
      content: message.content,
      attachments: message.attachments.map(a => a.url),
      timestamp: new Date().toISOString()
    });
    ticketTranscripts.set(message.channel.id, transcript);
  }
});

// Função para criar a mensagem principal de tickets com botões
async function createTicketMessage(channel) {
  // Cria o embed principal
  const embed = new EmbedBuilder()
    .setTitle('📩 Sistema de Suporte')
    .setDescription('Para abrir um ticket de suporte, selecione a categoria apropriada abaixo.')
    .setColor('#0099ff')
    .setFooter({ text: 'Sistema de Tickets' })
    .setTimestamp();
  
  // Adiciona campos para cada categoria
  Object.values(categorias).forEach(cat => {
    embed.addFields({
      name: `${cat.emoji} ${cat.nome}`,
      value: cat.descricao,
      inline: true
    });
  });
  
  // Cria botões para cada categoria
  const rows = [];
  const buttonsPerRow = 3;
  let currentRow = new ActionRowBuilder();
  let counter = 0;
  
  Object.values(categorias).forEach((cat, index) => {
    const button = new ButtonBuilder()
      .setCustomId(`ticket_create_${cat.id}`)
      .setLabel(cat.nome)
      .setEmoji(cat.emoji)
      .setStyle(ButtonStyle.Primary);
    
    currentRow.addComponents(button);
    counter++;
    
    if (counter === buttonsPerRow || index === Object.values(categorias).length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
      counter = 0;
    }
  });
  
  // Envia a mensagem com o embed e botões
  await channel.send({ 
    embeds: [embed],
    components: rows
  });
}

// Função para criar um canal de ticket
async function createTicketChannel(interaction, category, descricao) {
  const guild = interaction.guild;
  const member = interaction.member;
  
  try {
    // Cria o canal de texto
    const ticketChannel = await guild.channels.create({
      name: `ticket-${interaction.user.username.toLowerCase().replace(/\s+/g, '-')}`,
      type: ChannelType.GuildText,
      parent: config.categoryId,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: member.id, // Criador do ticket
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        },
        {
          id: config.staffRoleId, // Equipe de suporte
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }
      ]
    });
    
    // Cria o embed do ticket
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`${category.emoji} Ticket: ${category.nome}`)
      .setDescription('Nossa equipe de suporte irá atendê-lo em breve.')
      .setColor(category.cor)
      .addFields(
        { name: 'Usuário', value: `<@${member.id}>`, inline: true },
        { name: 'Categoria', value: category.nome, inline: true },
        { name: 'Descrição do problema', value: descricao }
      )
      .setImage(category.imagem)
      .setFooter({ text: `ID do Ticket: ${ticketChannel.id}` })
      .setTimestamp();
    
    // Botão para fechar o ticket
    const closeButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Fechar Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒')
      );
    
    // Envia a mensagem no canal do ticket
    await ticketChannel.send({ 
      content: `<@${member.id}> <@&${config.staffRoleId}>`,
      embeds: [ticketEmbed],
      components: [closeButton]
    });
    
    // Registra a abertura do ticket no canal de logs
    const logChannel = guild.channels.cache.get(config.ticketLogChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('📩 Novo Ticket Criado')
        .setDescription(`Ticket criado por <@${member.id}>`)
        .addFields(
          { name: 'Canal', value: `${ticketChannel}`, inline: true },
          { name: 'Categoria', value: category.nome, inline: true },
          { name: 'ID do Ticket', value: ticketChannel.id, inline: true }
        )
        .setColor(category.cor)
        .setTimestamp();
      
      await logChannel.send({ embeds: [logEmbed] });
    }
    
    return ticketChannel;
  } catch (error) {
    console.error('Erro ao criar canal de ticket:', error);
    return null;
  }
}

// Função para criar um canal de voz para o ticket
async function createTicketVoiceChannel(interaction, category) {
  const guild = interaction.guild;
  const member = interaction.member;
  
  try {
    // Cria o canal de voz
    const voiceChannel = await guild.channels.create({
      name: `🔊︱${category.nome}-${interaction.user.username}`,
      type: ChannelType.GuildVoice,
      parent: config.categoryId,
      permissionOverwrites: [
        {
          id: guild.id, // @everyone
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
        },
        {
          id: member.id, // Criador do ticket
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        },
        {
          id: config.staffRoleId, // Equipe de suporte
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        }
      ]
    });
    
    return voiceChannel;
  } catch (error) {
    console.error('Erro ao criar canal de voz:', error);
    return null;
  }
}

// Função para fechar um ticket
async function closeTicket(channel, closedBy) {
  try {
    // Verifica se é um canal de ticket
    if (!channel.name.startsWith('ticket-') || channel.parentId !== config.categoryId) {
      return;
    }
    
    // Busca informações do criador do ticket pelo nome do canal
    const ticketOwnerName = channel.name.replace('ticket-', '');
    const guild = channel.guild;
    
    // Procura o canal de voz relacionado
    const voiceChannel = guild.channels.cache.find(
      ch => ch.type === ChannelType.GuildVoice && 
      ch.name.includes(ticketOwnerName) && 
      ch.parentId === config.categoryId
    );
    
    // Obtém as transcrições do ticket
    const transcript = ticketTranscripts.get(channel.id) || [];
    
    // Gera um arquivo de transcrição em formato texto
    let transcriptText = '=== TRANSCRIÇÃO DO TICKET ===\n\n';
    transcriptText += `Canal: ${channel.name}\n`;
    transcriptText += `Aberto em: ${channel.createdAt.toLocaleString()}\n`;
    transcriptText += `Fechado em: ${new Date().toLocaleString()}\n`;
    transcriptText += `Fechado por: ${closedBy.tag}\n\n`;
    transcriptText += '=== MENSAGENS ===\n\n';
    
    transcript.forEach((msg, index) => {
      transcriptText += `[${new Date(msg.timestamp).toLocaleString()}] ${msg.author}: ${msg.content}\n`;
      if (msg.attachments.length > 0) {
        transcriptText += `  Anexos: ${msg.attachments.join(', ')}\n`;
      }
      if (index < transcript.length - 1) transcriptText += '\n';
    });
    
    // Cria um buffer com o texto da transcrição
    const transcriptBuffer = Buffer.from(transcriptText, 'utf-8');
    const attachment = new AttachmentBuilder(transcriptBuffer, { name: `transcript-${channel.name}.txt` });
    
    // Busca o membro que criou o ticket
    try {
      const ticketMembers = channel.permissionOverwrites.cache
        .filter(overwrite => overwrite.type === 1 && overwrite.id !== closedBy.id)
        .map(overwrite => overwrite.id);
      
      // Envia a transcrição para cada membro (normalmente será apenas o criador do ticket)
      for (const memberId of ticketMembers) {
        try {
          const member = await guild.members.fetch(memberId);
          
          if (member) {
            // Cria um embed para a mensagem de transcrição
            const transcriptEmbed = new EmbedBuilder()
              .setTitle('📜 Transcrição de Ticket')
              .setDescription(`Seu ticket \`${channel.name}\` foi fechado.`)
              .setColor('#ff9900')
              .addFields(
                { name: 'Aberto em', value: channel.createdAt.toLocaleString(), inline: true },
                { name: 'Fechado em', value: new Date().toLocaleString(), inline: true },
                { name: 'Fechado por', value: closedBy.tag, inline: true }
              )
              .setFooter({ text: 'Ticket System' })
              .setTimestamp();
            
            // Envia a mensagem com o embed e o arquivo de transcrição
            await member.send({
              embeds: [transcriptEmbed],
              files: [attachment]
            });
            
            console.log(`Transcrição enviada para ${member.user.tag}`);
          }
        } catch (error) {
          console.error(`Erro ao enviar transcrição para membro ${memberId}:`, error);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar membros do ticket:', error);
    }
    
    // Registra o fechamento do ticket no canal de logs
    const logChannel = guild.channels.cache.get(config.ticketLogChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🔒 Ticket Fechado')
        .setDescription(`Ticket \`${channel.name}\` foi fechado por ${closedBy.tag}`)
        .addFields(
          { name: 'ID do Ticket', value: channel.id, inline: true },
          { name: 'Aberto em', value: channel.createdAt.toLocaleString(), inline: true },
          { name: 'Fechado em', value: new Date().toLocaleString(), inline: true }
        )
        .setColor('#ff5555')
        .setTimestamp();
      
      await logChannel.send({
        embeds: [logEmbed],
        files: [attachment]
      });
    }
    
    // Remove o registro da transcrição
    ticketTranscripts.delete(channel.id);
    
    // Exclui os canais (texto e voz)
    await channel.send('🔒 Este ticket será fechado em 5 segundos...');
    
    setTimeout(async () => {
      if (voiceChannel) await voiceChannel.delete().catch(console.error);
      await channel.delete().catch(console.error);
    }, 5000);
    
  } catch (error) {
    console.error('Erro ao fechar ticket:', error);
  }
}

// Função para manter o bot online
function keepAlive() {
  // Se estiver em ambiente de produção no Replit
  if (process.env.REPLIT_DB_URL) {
    console.log("Configurando sistema para manter o bot online...");
    
    // Código para manter o bot online no Replit
    const express = require('express');
    const app = express();
    const port = process.env.PORT || 3000;
    
    app.get('/', (req, res) => {
      res.send('Bot está online!');
    });
    
    app.listen(port, () => {
      console.log(`Servidor express rodando na porta ${port}`);
    });
  }
}

// Inicializa o servidor web para manter o bot online
keepAlive();

// Conecta o bot ao Discord
client.login(config.token).catch(err => {
  console.error('Erro ao conectar ao Discord:', err);
  console.log('Verifique se o token está configurado corretamente nas variáveis de ambiente.');
});
