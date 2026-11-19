export const messages={
 'pt-PT':{
  today:'Hoje',hot:'Quentes',queue:'Fila',sales:'Funil',more:'Mais',dashboard:'Painel',leads:'Leads',campaigns:'Campanhas',chat:'Chat IA',inbox:'Caixa de entrada',import:'Importar leads',settings:'Definições',
  offline:'Sem ligação · a mostrar os últimos dados carregados. As ações ficam pausadas até voltar a ligar.',search:'Pesquisar ou abrir…',stop:'PARAR TUDO',resume:'Retomar',sample:'Dados de exemplo · credenciais por configurar',
  title:'O teu espaço de aquisição',todayIntro:'O que precisa da tua atenção e o que faz avançar negócios.',leadIntro:'Evidência, adequação e próximo passo de cada potencial cliente.',campaignIntro:'Revê rascunhos individuais ou confirma uma campanha em piloto automático.',
  importTitle:'Importar leads',importIntro:'Mapeia campos, deteta duplicados e valida a lista antes de importar.',chatTitle:'Chat IA',inboxTitle:'Caixa de entrada',salesTitle:'Funil comercial',setupTitle:'Configuração final',
  disconnected:'Gmail não ligado',sampleData:'Dados de exemplo ativos',synced:'Workspace sincronizada',
  titleToday:'O teu espaço de aquisição',titleProspects:'Potenciais clientes',titleCampaigns:'Campanhas',titleChat:'Chat IA',titleInbox:'Caixa de entrada',titleSales:'Funil comercial',titleSetup:'Configuração final',
  priorities:'PRIORIDADES DE HOJE',assistantLabel:'ASSISTENTE OPERACIONAL',setupChecklist:'LISTA DE CONFIGURAÇÃO',workspaceLabel:'ESPAÇO DEVREFRACT',phaseWorkspace:'ESPAÇO DE TRABALHO',phaseProspects:'POTENCIAIS CLIENTES',phaseOutreach:'CONTACTO',phaseAssistant:'ASSISTENTE',phaseConversations:'CONVERSAS',phaseRevenue:'RECEITA',phaseIntake:'IMPORTAÇÃO DE LEADS',phaseSetup:'CONFIGURAÇÃO',
  introToday:'O que precisa da tua atenção hoje e o que faz avançar negócios.',introImport:'Importa e valida a lista antes de iniciar uma campanha.',introLeads:'Evidências, adequação e próximo passo de cada potencial cliente.',introCampaigns:'Revê mensagens individuais ou confirma uma campanha em piloto automático.',introChat:'Consulta potenciais clientes, conversas e trabalho aprovado.',introInbox:'Respostas que precisam de uma decisão ou seguimento.',introSales:'Acompanha oportunidades, propostas e receita.',introSetup:'Liga os serviços e as contas quando estiveres pronto.',
 },
 'en-US':{
  today:'Today',hot:'Hot',queue:'Queue',sales:'Sales',more:'More',dashboard:'Dashboard',leads:'Leads',campaigns:'Campaigns',chat:'AI Chat',inbox:'Inbox',import:'Import leads',settings:'Settings',
  offline:'Offline · showing the last loaded workspace. Actions are paused until you reconnect.',search:'Search or jump to…',stop:'STOP ALL',resume:'Resume',sample:'Sample data · credentials not configured',
  title:'Your acquisition workspace',todayIntro:'What needs your attention today, and what moves deals forward.',leadIntro:'Evidence, fit, and the next best action for every prospect.',campaignIntro:'Review individual drafts or confirm a campaign for Auto Pilot.',
  importTitle:'Import leads',importIntro:'Map fields, catch duplicates, and validate the list before adding prospects.',chatTitle:'AI Chat',inboxTitle:'Inbox',salesTitle:'Sales pipeline',setupTitle:'Final setup',
  disconnected:'Gmail not connected',sampleData:'Sample data active',synced:'Synced workspace',
  titleToday:'Your acquisition workspace',titleProspects:'Prospects',titleCampaigns:'Campaigns',titleChat:'AI Chat',titleInbox:'Inbox',titleSales:'Sales pipeline',titleSetup:'Final setup',
  priorities:'TODAY’S PRIORITIES',assistantLabel:'OPERATIONAL ASSISTANT',setupChecklist:'SETUP CHECKLIST',workspaceLabel:'DEVREFRACT WORKSPACE',phaseWorkspace:'WORKSPACE',phaseProspects:'PROSPECTS',phaseOutreach:'OUTREACH',phaseAssistant:'ASSISTANT',phaseConversations:'CONVERSATIONS',phaseRevenue:'REVENUE',phaseIntake:'LEAD INTAKE',phaseSetup:'SETUP',
  introToday:'What needs your attention today, and what moves deals forward.',introImport:'Import and validate your list before starting a campaign.',introLeads:'Evidence, fit, and the next best action for every prospect.',introCampaigns:'Review individual messages or confirm a campaign for Auto Pilot.',introChat:'Search prospects, conversations, and approved work.',introInbox:'Replies that need a decision or a follow-up.',introSales:'Track opportunities, proposals, and revenue.',introSetup:'Connect services and accounts when you’re ready to go live.',
 }
} as const;
export type Locale=keyof typeof messages;
export function translate(locale:Locale,key:keyof typeof messages['en-US']){return messages[locale][key]||messages['en-US'][key];}
