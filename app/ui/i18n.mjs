import {LANGUAGES,DEFAULT_LANGUAGE,validLanguage,normalizeLanguage,languageDirection} from '../src/languages.mjs';
import {EXTRA_TRANSLATIONS} from './locales.mjs';
import {STANDARD_MODE_TEXT} from './standard-mode-text.mjs';
export {LANGUAGES,DEFAULT_LANGUAGE,validLanguage,normalizeLanguage,languageDirection};
export const MESSAGES=[
...STANDARD_MODE_TEXT.map(row=>row.slice(0,5)),
["Download do Tutorial em PDF","Download PDF Tutorial","Descargar tutorial en PDF","Télécharger le tutoriel PDF","Scarica il tutorial PDF"],
["Redes sociais","Social media","Redes sociales","Réseaux sociaux","Social media"],
["Ocupado","Busy","Ocupado","Occupé","Occupato"],
["Aguarde que a operação deste perfil termine.","Wait for this profile operation to finish.","Espera a que termine la operación de este perfil.","Attendez la fin de cette opération du profil.","Attendi il completamento dell’operazione su questo profilo."],
 ["As novas extensões locais do modo integrado são guardadas com os dados portáteis; a pasta original deixa de ser necessária.","New local extensions in embedded mode are saved with portable data; the original folder is no longer needed.","Las nuevas extensiones locales del modo integrado se guardan con los datos portátiles; la carpeta original deja de ser necesaria.","Les nouvelles extensions locales du mode intégré sont enregistrées avec les données portables ; le dossier original n’est plus nécessaire.","Le nuove estensioni locali in modalità integrata vengono salvate con i dati portatili; la cartella originale non è più necessaria."],
 [
  "Perfis de navegação",
  "Browser profiles",
  "Perfiles del navegador",
  "Profils du navigateur",
  "Profili del browser"
 ],
 [
  "Perfis",
  "Profiles",
  "Perfiles",
  "Profils",
  "Profili"
 ],
 [
  "Grupos",
  "Groups",
  "Grupos",
  "Groupes",
  "Gruppi"
 ],
 [
  "Histórico",
  "History",
  "Historial",
  "Historique",
  "Cronologia"
 ],
 [
  "Favoritos",
  "Bookmarks",
  "Marcadores",
  "Favoris",
  "Preferiti"
 ],
 [
  "Transferências",
  "Downloads",
  "Descargas",
  "Téléchargements",
  "Download"
 ],
 [
  "Extensões",
  "Extensions",
  "Extensiones",
  "Extensions",
  "Estensioni"
 ],
 [
  "Definições",
  "Settings",
  "Configuración",
  "Paramètres",
  "Impostazioni"
 ],
 [
  "Espaço de trabalho",
  "Workspace",
  "Espacio de trabajo",
  "Espace de travail",
  "Area di lavoro"
 ],
 [
  "Espaço de trabalho /",
  "Workspace /",
  "Espacio de trabajo /",
  "Espace de travail /",
  "Area di lavoro /"
 ],
 [
  "Local",
  "Local",
  "Local",
  "Local",
  "Locale"
 ],
 [
  "O SEU ESPAÇO DE NAVEGAÇÃO",
  "YOUR BROWSING WORKSPACE",
  "TU ESPACIO DE NAVEGACIÓN",
  "VOTRE ESPACE DE NAVIGATION",
  "IL TUO SPAZIO DI NAVIGAZIONE"
 ],
 [
  "Os seus dados ficam neste computador.",
  "Your data stays on this computer.",
  "Tus datos permanecen en este equipo.",
  "Vos données restent sur cet ordinateur.",
  "I tuoi dati rimangono su questo computer."
 ],
 [
  "Cookies e armazenamento separados por perfil.",
  "Separate cookies and storage for each profile.",
  "Cookies y almacenamiento separados por perfil.",
  "Cookies et stockage séparés par profil.",
  "Cookie e archiviazione separati per profilo."
 ],
 [
  "Espaço pessoal",
  "Personal workspace",
  "Espacio personal",
  "Espace personnel",
  "Spazio personale"
 ],
 [
  "Cada identidade, no seu próprio espaço.",
  "A separate space for every identity.",
  "Un espacio propio para cada identidad.",
  "Un espace distinct pour chaque identité.",
  "Uno spazio separato per ogni identità."
 ],
 [
  "Criar perfil",
  "Create profile",
  "Crear perfil",
  "Créer un profil",
  "Crea profilo"
 ],
 [
  "Criar o primeiro perfil",
  "Create your first profile",
  "Crear el primer perfil",
  "Créer votre premier profil",
  "Crea il primo profilo"
 ],
 [
  "Criar em lote",
  "Create in bulk",
  "Crear en lote",
  "Créer en lot",
  "Crea in blocco"
 ],
 [
  "Atualizar",
  "Refresh",
  "Actualizar",
  "Actualiser",
  "Aggiorna"
 ],
 [
  "Mudar tema",
  "Change theme",
  "Cambiar tema",
  "Changer de thème",
  "Cambia tema"
 ],
 [
  "Perfis guardados",
  "Saved profiles",
  "Perfiles guardados",
  "Profils enregistrés",
  "Profili salvati"
 ],
 [
  "Organizados à sua maneira",
  "Organized your way",
  "Organizados a tu manera",
  "Organisés à votre façon",
  "Organizzati a modo tuo"
 ],
 [
  "Em execução",
  "Running",
  "En ejecución",
  "En cours",
  "In esecuzione"
 ],
 [
  "Navegação independente",
  "Independent browsing",
  "Navegación independiente",
  "Navigation indépendante",
  "Navigazione indipendente"
 ],
 [
  "Com proxy",
  "With proxy",
  "Con proxy",
  "Avec proxy",
  "Con proxy"
 ],
 [
  "Ligação própria por perfil",
  "A separate connection per profile",
  "Una conexión por perfil",
  "Une connexion par profil",
  "Una connessione per profilo"
 ],
 [
  "Organize pessoas e projetos",
  "Organize people and projects",
  "Organiza personas y proyectos",
  "Organisez personnes et projets",
  "Organizza persone e progetti"
 ],
 [
  "Os seus perfis",
  "Your profiles",
  "Tus perfiles",
  "Vos profils",
  "I tuoi profili"
 ],
 [
  "Selecione um perfil e comece a navegar.",
  "Select a profile and start browsing.",
  "Selecciona un perfil y empieza a navegar.",
  "Sélectionnez un profil pour naviguer.",
  "Seleziona un profilo e inizia a navigare."
 ],
 [
  "Abrir grupo",
  "Open group",
  "Abrir grupo",
  "Ouvrir le groupe",
  "Apri gruppo"
 ],
 [
  "Importar",
  "Import",
  "Importar",
  "Importer",
  "Importa"
 ],
 [
  "Exportar JSON",
  "Export JSON",
  "Exportar JSON",
  "Exporter JSON",
  "Esporta JSON"
 ],
 [
  "Exportar CSV",
  "Export CSV",
  "Exportar CSV",
  "Exporter CSV",
  "Esporta CSV"
 ],
 [
  "Modelo CSV",
  "CSV template",
  "Plantilla CSV",
  "Modèle CSV",
  "Modello CSV"
 ],
 [
  "Eliminar seleção",
  "Delete selection",
  "Eliminar selección",
  "Supprimer la sélection",
  "Elimina selezione"
 ],
 [
  "Parar todos",
  "Stop all",
  "Detener todos",
  "Tout arrêter",
  "Arresta tutti"
 ],
 [
  "Todos os grupos",
  "All groups",
  "Todos los grupos",
  "Tous les groupes",
  "Tutti i gruppi"
 ],
 [
  "Todos os estados",
  "All statuses",
  "Todos los estados",
  "Tous les états",
  "Tutti gli stati"
 ],
 [
  "Parados",
  "Stopped",
  "Detenidos",
  "Arrêtés",
  "Arrestati"
 ],
 [
  "Parado",
  "Stopped",
  "Detenido",
  "Arrêté",
  "Arrestato"
 ],
 [
  "Mais recentes",
  "Newest first",
  "Más recientes",
  "Les plus récents",
  "Più recenti"
 ],
 [
  "Mais antigos",
  "Oldest first",
  "Más antiguos",
  "Les plus anciens",
  "Più vecchi"
 ],
 [
  "Nome A–Z",
  "Name A–Z",
  "Nombre A–Z",
  "Nom A–Z",
  "Nome A–Z"
 ],
 [
  "Nome Z–A",
  "Name Z–A",
  "Nombre Z–A",
  "Nom Z–A",
  "Nome Z–A"
 ],
 [
  "Última abertura",
  "Last opened",
  "Última apertura",
  "Dernière ouverture",
  "Ultima apertura"
 ],
 [
  "Aberturas mais antigas",
  "Oldest opened",
  "Aperturas más antiguas",
  "Ouvertures anciennes",
  "Aperture più vecchie"
 ],
 [
  "Nenhum perfil selecionado",
  "No profiles selected",
  "Ningún perfil seleccionado",
  "Aucun profil sélectionné",
  "Nessun profilo selezionato"
 ],
 [
  "Perfil",
  "Profile",
  "Perfil",
  "Profil",
  "Profilo"
 ],
 [
  "Criado",
  "Created",
  "Creado",
  "Créé",
  "Creato"
 ],
 [
  "Última abertura ↕",
  "Last opened ↕",
  "Última apertura ↕",
  "Dernière ouverture ↕",
  "Ultima apertura ↕"
 ],
 [
  "Estado",
  "Status",
  "Estado",
  "État",
  "Stato"
 ],
 [
  "Grupo",
  "Group",
  "Grupo",
  "Groupe",
  "Gruppo"
 ],
 [
  "Ações / fixar",
  "Actions / pin",
  "Acciones / fijar",
  "Actions / épingler",
  "Azioni / fissa"
 ],
 [
  "Perfil ↕",
  "Profile ↕",
  "Perfil ↕",
  "Profil ↕",
  "Profilo ↕"
 ],
 [
  "Criado ↕",
  "Created ↕",
  "Creado ↕",
  "Créé ↕",
  "Creato ↕"
 ],
 [
  "O seu próximo espaço começa aqui",
  "Your next workspace starts here",
  "Tu próximo espacio empieza aquí",
  "Votre prochain espace commence ici",
  "Il tuo prossimo spazio inizia qui"
 ],
 [
  "Crie um perfil para manter sessões e projetos separados.",
  "Create a profile to keep sessions and projects separate.",
  "Crea un perfil para separar sesiones y proyectos.",
  "Créez un profil pour séparer sessions et projets.",
  "Crea un profilo per separare sessioni e progetti."
 ],
 [
  "Resultados",
  "Results",
  "Resultados",
  "Résultats",
  "Risultati"
 ],
 [
  "Anterior",
  "Previous",
  "Anterior",
  "Précédent",
  "Precedente"
 ],
 [
  "Seguinte",
  "Next",
  "Siguiente",
  "Suivant",
  "Successivo"
 ],
 [
  "Primeira",
  "First",
  "Primera",
  "Première",
  "Prima"
 ],
 [
  "Última",
  "Last",
  "Última",
  "Dernière",
  "Ultima"
 ],
 [
  "Ir para página",
  "Go to page",
  "Ir a la página",
  "Aller à la page",
  "Vai alla pagina"
 ],
 [
  "Selecionar esta página",
  "Select this page",
  "Seleccionar esta página",
  "Sélectionner cette page",
  "Seleziona questa pagina"
 ],
 [
  "Grupos de trabalho",
  "Profile groups",
  "Grupos de perfiles",
  "Groupes de profils",
  "Gruppi di profili"
 ],
 [
  "Novo grupo",
  "New group",
  "Nuevo grupo",
  "Nouveau groupe",
  "Nuovo gruppo"
 ],
 [
  "Eliminar grupos selecionados",
  "Delete selected groups",
  "Eliminar grupos seleccionados",
  "Supprimer les groupes sélectionnés",
  "Elimina i gruppi selezionati"
 ],
 [
  "Selecionar grupos visíveis",
  "Select visible groups",
  "Seleccionar grupos visibles",
  "Sélectionner les groupes visibles",
  "Seleziona i gruppi visibili"
 ],
 [
  "Limpar seleção",
  "Clear selection",
  "Limpiar selección",
  "Effacer la sélection",
  "Cancella selezione"
 ],
 [
  "Histórico de navegação",
  "Browsing history",
  "Historial de navegación",
  "Historique de navigation",
  "Cronologia di navigazione"
 ],
 [
  "Limpar histórico",
  "Clear history",
  "Borrar historial",
  "Effacer l'historique",
  "Cancella cronologia"
 ],
 [
  "Favoritos por perfil",
  "Bookmarks by profile",
  "Marcadores por perfil",
  "Favoris par profil",
  "Preferiti per profilo"
 ],
 [
  "Guarde páginas com a estrela da janela de navegação.",
  "Save pages using the star in the browser window.",
  "Guarda páginas con la estrella de la ventana.",
  "Enregistrez des pages avec l'étoile du navigateur.",
  "Salva le pagine con la stella del browser."
 ],
 [
  "Extensões por perfil",
  "Extensions by profile",
  "Extensiones por perfil",
  "Extensions par profil",
  "Estensioni per profilo"
 ],
 [
  "Transferências por perfil",
  "Downloads by profile",
  "Descargas por perfil",
  "Téléchargements par profil",
  "Download per profilo"
 ],
 [
  "Limpar registos terminados",
  "Clear completed records",
  "Borrar registros terminados",
  "Effacer les éléments terminés",
  "Cancella i record completati"
 ],
 [
  "Um espaço só seu",
  "Your own workspace",
  "Tu propio espacio",
  "Votre espace personnel",
  "Il tuo spazio personale"
 ],
 [
  "Aparência",
  "Appearance",
  "Apariencia",
  "Apparence",
  "Aspetto"
 ],
 [
  "Escolha o tema do gestor.",
  "Choose the manager theme.",
  "Elige el tema del gestor.",
  "Choisissez le thème du gestionnaire.",
  "Scegli il tema del gestore."
 ],
 [
  "Alternar claro / escuro",
  "Toggle light / dark",
  "Alternar claro / oscuro",
  "Basculer clair / sombre",
  "Alterna chiaro / scuro"
 ],
 [
  "Limpar dados de um perfil",
  "Clear profile data",
  "Borrar datos de un perfil",
  "Effacer les données d'un profil",
  "Cancella i dati di un profilo"
 ],
 [
  "Cookies e dados dos sites",
  "Cookies and site data",
  "Cookies y datos de sitios",
  "Cookies et données des sites",
  "Cookie e dati dei siti"
 ],
 [
  "Imagens e ficheiros em cache",
  "Cached images and files",
  "Imágenes y archivos en caché",
  "Images et fichiers en cache",
  "Immagini e file nella cache"
 ],
 [
  "Período do histórico",
  "History time range",
  "Período del historial",
  "Période de l'historique",
  "Intervallo della cronologia"
 ],
 [
  "Última hora",
  "Last hour",
  "Última hora",
  "Dernière heure",
  "Ultima ora"
 ],
 [
  "Últimas 24 horas",
  "Last 24 hours",
  "Últimas 24 horas",
  "Dernières 24 heures",
  "Ultime 24 ore"
 ],
 [
  "Últimos 7 dias",
  "Last 7 days",
  "Últimos 7 días",
  "7 derniers jours",
  "Ultimi 7 giorni"
 ],
 [
  "Últimas 4 semanas",
  "Last 4 weeks",
  "Últimas 4 semanas",
  "4 dernières semaines",
  "Ultime 4 settimane"
 ],
 [
  "Sempre",
  "All time",
  "Todo el tiempo",
  "Depuis toujours",
  "Sempre"
 ],
 [
  "Privacidade e isolamento",
  "Privacy and isolation",
  "Privacidad y aislamiento",
  "Confidentialité et isolation",
  "Privacy e isolamento"
 ],
 [
  "Importação e partilha",
  "Import and sharing",
  "Importación y uso compartido",
  "Importation et partage",
  "Importazione e condivisione"
 ],
 [
  "Motor de navegação",
  "Browser engine",
  "Motor del navegador",
  "Moteur du navigateur",
  "Motore del browser"
 ],
 [
  "Perfis independentes. Trabalho organizado.",
  "Independent profiles. Organized work.",
  "Perfiles independientes. Trabajo organizado.",
  "Profils indépendants. Travail organisé.",
  "Profili indipendenti. Lavoro organizzato."
 ],
 [
  "Identidade de navegação",
  "Browser identity",
  "Identidad de navegación",
  "Identité de navigation",
  "Identità di navigazione"
 ],
 [
  "Dados básicos",
  "Basic details",
  "Datos básicos",
  "Informations générales",
  "Dati di base"
 ],
 [
  "Motor do navegador",
  "Browser engine",
  "Motor del navegador",
  "Moteur du navigateur",
  "Motore del browser"
 ],
 [
  "Integrado (Electron)",
  "Embedded (Electron)",
  "Integrado (Electron)",
  "Intégré (Electron)",
  "Integrato (Electron)"
 ],
 [
  "Nome do perfil",
  "Profile name",
  "Nombre del perfil",
  "Nom du profil",
  "Nome del profilo"
 ],
 [
  "Nome desta identidade",
  "Name this identity",
  "Nombre de esta identidad",
  "Nom de cette identité",
  "Nome di questa identità"
 ],
 [
  "Descrição",
  "Description",
  "Descripción",
  "Description",
  "Descrizione"
 ],
 [
  "Escolher ou criar",
  "Choose or create",
  "Elegir o crear",
  "Choisir ou créer",
  "Scegli o crea"
 ],
 [
  "Cor",
  "Color",
  "Color",
  "Couleur",
  "Colore"
 ],
 [
  "Página inicial",
  "Home page",
  "Página inicial",
  "Page d'accueil",
  "Pagina iniziale"
 ],
 [
  "Ao abrir este perfil",
  "When this profile opens",
  "Al abrir este perfil",
  "À l'ouverture de ce profil",
  "All'apertura del profilo"
 ],
 [
  "Abrir páginas configuradas",
  "Open configured pages",
  "Abrir páginas configuradas",
  "Ouvrir les pages configurées",
  "Apri le pagine configurate"
 ],
 [
  "Continuar onde ficou",
  "Continue where you left off",
  "Continuar donde lo dejaste",
  "Reprendre la session",
  "Riprendi la sessione"
 ],
 [
  "Abrir um separador vazio",
  "Open a blank tab",
  "Abrir una pestaña vacía",
  "Ouvrir un onglet vide",
  "Apri una scheda vuota"
 ],
 [
  "Páginas de arranque",
  "Startup pages",
  "Páginas de inicio",
  "Pages au démarrage",
  "Pagine all'avvio"
 ],
 [
  "Idioma",
  "Language",
  "Idioma",
  "Langue",
  "Lingua"
 ],
 [
  "Idioma da interface",
  "Interface language",
  "Idioma de la interfaz",
  "Langue de l'interface",
  "Lingua dell'interfaccia"
 ],
 [
  "Proxy (opcional)",
  "Proxy (optional)",
  "Proxy (opcional)",
  "Proxy (facultatif)",
  "Proxy (facoltativo)"
 ],
 [
  "Endereço completo",
  "Full address",
  "Dirección completa",
  "Adresse complète",
  "Indirizzo completo"
 ],
 [
  "Dados separados",
  "Separate fields",
  "Campos separados",
  "Champs séparés",
  "Campi separati"
 ],
 [
  "Servidor proxy",
  "Proxy server",
  "Servidor proxy",
  "Serveur proxy",
  "Server proxy"
 ],
 [
  "Protocolo",
  "Protocol",
  "Protocolo",
  "Protocole",
  "Protocollo"
 ],
 [
  "Servidor",
  "Server",
  "Servidor",
  "Serveur",
  "Server"
 ],
 [
  "Porta",
  "Port",
  "Puerto",
  "Port",
  "Porta"
 ],
 [
  "Utilizador",
  "Username",
  "Usuario",
  "Nom d'utilisateur",
  "Nome utente"
 ],
 [
  "Palavra-passe",
  "Password",
  "Contraseña",
  "Mot de passe",
  "Password"
 ],
 [
  "Vazio mantém a existente",
  "Leave blank to keep existing",
  "Vacío conserva la actual",
  "Vide pour conserver l'existant",
  "Vuoto mantiene quella esistente"
 ],
 [
  "Esquecer a palavra-passe guardada",
  "Forget saved password",
  "Olvidar contraseña guardada",
  "Oublier le mot de passe enregistré",
  "Dimentica la password salvata"
 ],
 [
  "Gerir fingerprint e ambiente",
  "Fingerprint and environment",
  "Huella y entorno",
  "Empreinte et environnement",
  "Impronta e ambiente"
 ],
 [
  "Automático · Chromium nativo",
  "Automatic · Native Chromium",
  "Automático · Chromium nativo",
  "Automatique · Chromium natif",
  "Automatico · Chromium nativo"
 ],
 [
  "Usar padrão",
  "Use default",
  "Usar predeterminado",
  "Valeur par défaut",
  "Usa predefinito"
 ],
 [
  "Fuso horário",
  "Time zone",
  "Zona horaria",
  "Fuseau horaire",
  "Fuso orario"
 ],
 [
  "O do sistema",
  "System default",
  "El del sistema",
  "Celui du système",
  "Quello del sistema"
 ],
 [
  "Latitude",
  "Latitude",
  "Latitud",
  "Latitude",
  "Latitudine"
 ],
 [
  "Longitude",
  "Longitude",
  "Longitud",
  "Longitude",
  "Longitudine"
 ],
 [
  "Opcional",
  "Optional",
  "Opcional",
  "Facultatif",
  "Facoltativo"
 ],
 [
  "Largura da janela",
  "Window width",
  "Ancho de ventana",
  "Largeur de fenêtre",
  "Larghezza finestra"
 ],
 [
  "Altura da janela",
  "Window height",
  "Alto de ventana",
  "Hauteur de fenêtre",
  "Altezza finestra"
 ],
 [
  "Aplicar também a resolução apresentada aos sites",
  "Also override screen resolution shown to sites",
  "Aplicar también la resolución mostrada a los sitios",
  "Appliquer aussi la résolution présentée aux sites",
  "Applica anche la risoluzione mostrata ai siti"
 ],
 [
  "Restrições de privacidade",
  "Privacy restrictions",
  "Restricciones de privacidad",
  "Restrictions de confidentialité",
  "Restrizioni di privacy"
 ],
 [
  "Bloquear leitura de Canvas",
  "Block Canvas reads",
  "Bloquear lectura de Canvas",
  "Bloquer la lecture de Canvas",
  "Blocca la lettura di Canvas"
 ],
 [
  "Desativar WebGL",
  "Disable WebGL",
  "Desactivar WebGL",
  "Désactiver WebGL",
  "Disattiva WebGL"
 ],
 [
  "Limitar deteção de fontes",
  "Limit font detection",
  "Limitar detección de fuentes",
  "Limiter la détection des polices",
  "Limita il rilevamento dei font"
 ],
 [
  "Desativar AudioContext",
  "Disable AudioContext",
  "Desactivar AudioContext",
  "Désactiver AudioContext",
  "Disattiva AudioContext"
 ],
 [
  "Desativar WebRTC",
  "Disable WebRTC",
  "Desactivar WebRTC",
  "Désactiver WebRTC",
  "Disattiva WebRTC"
 ],
 [
  "Evitar UDP fora do proxy",
  "Prevent non-proxied UDP",
  "Evitar UDP fuera del proxy",
  "Éviter UDP hors proxy",
  "Evita UDP fuori dal proxy"
 ],
 [
  "Cancelar",
  "Cancel",
  "Cancelar",
  "Annuler",
  "Annulla"
 ],
 [
  "Guardar perfil",
  "Save profile",
  "Guardar perfil",
  "Enregistrer le profil",
  "Salva profilo"
 ],
 [
  "Fechar",
  "Close",
  "Cerrar",
  "Fermer",
  "Chiudi"
 ],
 [
  "Nome",
  "Name",
  "Nombre",
  "Nom",
  "Nome"
 ],
 [
  "Guardar grupo",
  "Save group",
  "Guardar grupo",
  "Enregistrer le groupe",
  "Salva gruppo"
 ],
 [
  "Editar favorito",
  "Edit bookmark",
  "Editar marcador",
  "Modifier le favori",
  "Modifica preferito"
 ],
 [
  "Título",
  "Title",
  "Título",
  "Titre",
  "Titolo"
 ],
 [
  "Endereço",
  "Address",
  "Dirección",
  "Adresse",
  "Indirizzo"
 ],
 [
  "Notas",
  "Notes",
  "Notas",
  "Notes",
  "Note"
 ],
 [
  "Guardar",
  "Save",
  "Guardar",
  "Enregistrer",
  "Salva"
 ],
 [
  "Continuar",
  "Continue",
  "Continuar",
  "Continuer",
  "Continua"
 ],
 [
  "Valor",
  "Value",
  "Valor",
  "Valeur",
  "Valore"
 ],
 [
  "Novo separador",
  "New tab",
  "Nueva pestaña",
  "Nouvel onglet",
  "Nuova scheda"
 ],
 [
  "Fechar separador",
  "Close tab",
  "Cerrar pestaña",
  "Fermer l'onglet",
  "Chiudi scheda"
 ],
 [
  "Recuar",
  "Back",
  "Atrás",
  "Retour",
  "Indietro"
 ],
 [
  "Avançar",
  "Forward",
  "Adelante",
  "Suivant",
  "Avanti"
 ],
 [
  "Recarregar",
  "Reload",
  "Recargar",
  "Actualiser",
  "Ricarica"
 ],
 [
  "Pesquisar ou introduzir endereço",
  "Search or enter an address",
  "Buscar o introducir dirección",
  "Rechercher ou saisir une adresse",
  "Cerca o inserisci un indirizzo"
 ],
 [
  "Ir",
  "Go",
  "Ir",
  "Aller",
  "Vai"
 ],
 [
  "Guardar favorito",
  "Save bookmark",
  "Guardar marcador",
  "Enregistrer le favori",
  "Salva preferito"
 ],
 [
  "Procurar nesta página",
  "Find on this page",
  "Buscar en esta página",
  "Rechercher sur cette page",
  "Trova in questa pagina"
 ],
 [
  "Procurar na página",
  "Find in page",
  "Buscar en la página",
  "Rechercher dans la page",
  "Trova nella pagina"
 ],
 [
  "Resultado anterior",
  "Previous match",
  "Resultado anterior",
  "Résultat précédent",
  "Risultato precedente"
 ],
 [
  "Resultado seguinte",
  "Next match",
  "Resultado siguiente",
  "Résultat suivant",
  "Risultato successivo"
 ],
 [
  "Fechar pesquisa",
  "Close search",
  "Cerrar búsqueda",
  "Fermer la recherche",
  "Chiudi ricerca"
 ],
 [
  "Diminuir zoom",
  "Zoom out",
  "Reducir zoom",
  "Réduire le zoom",
  "Riduci zoom"
 ],
 [
  "Aumentar zoom",
  "Zoom in",
  "Ampliar zoom",
  "Augmenter le zoom",
  "Aumenta zoom"
 ],
 [
  "Pasta de transferências",
  "Downloads",
  "Descargas",
  "Téléchargements",
  "Download"
 ],
 [
  "Menu do navegador",
  "Browser menu",
  "Menú del navegador",
  "Menu du navigateur",
  "Menu del browser"
 ],
 [
  "Um espaço para esta identidade.",
  "A space for this identity.",
  "Un espacio para esta identidad.",
  "Un espace pour cette identité.",
  "Uno spazio per questa identità."
 ],
 [
  "Introduza um endereço para começar a navegar.",
  "Enter an address to start browsing.",
  "Introduce una dirección para navegar.",
  "Saisissez une adresse pour naviguer.",
  "Inserisci un indirizzo per navigare."
 ],
 [
  "Pesquisar perfis",
  "Search profiles",
  "Buscar perfiles",
  "Rechercher des profils",
  "Cerca profili"
 ],
 [
  "Pesquisar perfis, grupos ou notas…",
  "Search profiles, groups or notes…",
  "Buscar perfiles, grupos o notas…",
  "Rechercher profils, groupes ou notes…",
  "Cerca profili, gruppi o note…"
 ],
 [
  "Pesquisar grupos",
  "Search groups",
  "Buscar grupos",
  "Rechercher des groupes",
  "Cerca gruppi"
 ],
 [
  "Pesquisar grupos…",
  "Search groups…",
  "Buscar grupos…",
  "Rechercher des groupes…",
  "Cerca gruppi…"
 ],
 [
  "Pesquisar no histórico",
  "Search history",
  "Buscar en el historial",
  "Rechercher dans l'historique",
  "Cerca nella cronologia"
 ],
 [
  "Pesquisar no histórico…",
  "Search history…",
  "Buscar en el historial…",
  "Rechercher dans l'historique…",
  "Cerca nella cronologia…"
 ],
 [
  "Filtrar por grupo",
  "Filter by group",
  "Filtrar por grupo",
  "Filtrer par groupe",
  "Filtra per gruppo"
 ],
 [
  "Filtrar por estado",
  "Filter by status",
  "Filtrar por estado",
  "Filtrer par état",
  "Filtra per stato"
 ],
 [
  "Ordenação",
  "Sort",
  "Ordenación",
  "Tri",
  "Ordinamento"
 ],
 [
  "Um endereço por linha (máximo de 10). Vazio utiliza a página inicial.",
  "One address per line (up to 10). Empty uses the home page.",
  "Una dirección por línea (máximo 10). Vacío usa la página inicial.",
  "Une adresse par ligne (10 maximum). Vide utilise la page d'accueil.",
  "Un indirizzo per riga (massimo 10). Vuoto usa la pagina iniziale."
 ],
 [
  "Editar",
  "Edit",
  "Editar",
  "Modifier",
  "Modifica"
 ],
 [
  "Editar perfil",
  "Edit profile",
  "Editar perfil",
  "Modifier le profil",
  "Modifica profilo"
 ],
 [
  "Editar grupo",
  "Edit group",
  "Editar grupo",
  "Modifier le groupe",
  "Modifica gruppo"
 ],
 [
  "Abrir",
  "Open",
  "Abrir",
  "Ouvrir",
  "Apri"
 ],
 [
  "Parar",
  "Stop",
  "Detener",
  "Arrêter",
  "Arresta"
 ],
 [
  "Fixar / desafixar",
  "Pin / unpin",
  "Fijar / desfijar",
  "Épingler / détacher",
  "Fissa / sblocca"
 ],
 [
  "Fixar perfil",
  "Pin profile",
  "Fijar perfil",
  "Épingler le profil",
  "Fissa profilo"
 ],
 [
  "Desafixar perfil",
  "Unpin profile",
  "Desfijar perfil",
  "Détacher le profil",
  "Sblocca profilo"
 ],
 [
  "Duplicar configuração",
  "Duplicate configuration",
  "Duplicar configuración",
  "Dupliquer la configuration",
  "Duplica configurazione"
 ],
 [
  "Exportar configuração",
  "Export configuration",
  "Exportar configuración",
  "Exporter la configuration",
  "Esporta configurazione"
 ],
 [
  "Partilhar sessão (encriptada)",
  "Share session (encrypted)",
  "Compartir sesión (cifrada)",
  "Partager la session (chiffrée)",
  "Condividi sessione (cifrata)"
 ],
 [
  "Partilhar cookies (encriptado)",
  "Share cookies (encrypted)",
  "Compartir cookies (cifrados)",
  "Partager les cookies (chiffrés)",
  "Condividi cookie (cifrati)"
 ],
 [
  "Testar proxy / IP",
  "Test proxy / IP",
  "Probar proxy / IP",
  "Tester le proxy / IP",
  "Verifica proxy / IP"
 ],
 [
  "Adicionar extensão local",
  "Add local extension",
  "Añadir extensión local",
  "Ajouter une extension locale",
  "Aggiungi estensione locale"
 ],
 [
  "Adicionar extensão",
  "Add extension",
  "Añadir extensión",
  "Ajouter une extension",
  "Aggiungi estensione"
 ],
 [
  "Gerir extensões",
  "Manage extensions",
  "Gestionar extensiones",
  "Gérer les extensions",
  "Gestisci estensioni"
 ],
 [
  "Gerir extensões no navegador",
  "Manage browser extensions",
  "Gestionar extensiones del navegador",
  "Gérer les extensions du navigateur",
  "Gestisci estensioni del browser"
 ],
 [
  "Loja de extensões",
  "Extension store",
  "Tienda de extensiones",
  "Boutique d'extensions",
  "Negozio di estensioni"
 ],
 [
  "Definições do navegador",
  "Browser settings",
  "Configuración del navegador",
  "Paramètres du navigateur",
  "Impostazioni del browser"
 ],
 [
  "Histórico do navegador",
  "Browser history",
  "Historial del navegador",
  "Historique du navigateur",
  "Cronologia del browser"
 ],
 [
  "Transferências do navegador",
  "Browser downloads",
  "Descargas del navegador",
  "Téléchargements du navigateur",
  "Download del browser"
 ],
 [
  "Favoritos do navegador",
  "Browser bookmarks",
  "Marcadores del navegador",
  "Favoris du navigateur",
  "Preferiti del browser"
 ],
 [
  "Limpar dados de navegação",
  "Clear browsing data",
  "Borrar datos de navegación",
  "Effacer les données de navigation",
  "Cancella dati di navigazione"
 ],
 [
  "Eliminar perfil",
  "Delete profile",
  "Eliminar perfil",
  "Supprimer le profil",
  "Elimina profilo"
 ],
 [
  "Sem grupo",
  "No group",
  "Sin grupo",
  "Sans groupe",
  "Senza gruppo"
 ],
 [
  "Sem descrição",
  "No description",
  "Sin descripción",
  "Sans description",
  "Senza descrizione"
 ],
 [
  "Ver perfis",
  "View profiles",
  "Ver perfiles",
  "Voir les profils",
  "Visualizza profili"
 ],
 [
  "Remover",
  "Remove",
  "Eliminar",
  "Supprimer",
  "Rimuovi"
 ],
 [
  "Mostrar na pasta",
  "Show in folder",
  "Mostrar en carpeta",
  "Afficher dans le dossier",
  "Mostra nella cartella"
 ],
 [
  "Retomar",
  "Resume",
  "Reanudar",
  "Reprendre",
  "Riprendi"
 ],
 [
  "Pausar",
  "Pause",
  "Pausar",
  "Suspendre",
  "Pausa"
 ],
 [
  "Concluída",
  "Completed",
  "Completada",
  "Terminé",
  "Completato"
 ],
 [
  "A transferir",
  "Downloading",
  "Descargando",
  "Téléchargement",
  "Download in corso"
 ],
 [
  "Pausada",
  "Paused",
  "Pausada",
  "Suspendu",
  "In pausa"
 ],
 [
  "Cancelada",
  "Cancelled",
  "Cancelada",
  "Annulé",
  "Annullato"
 ],
 [
  "Interrompida",
  "Interrupted",
  "Interrumpida",
  "Interrompu",
  "Interrotto"
 ],
 [
  "Ainda não existem transferências.",
  "No downloads yet.",
  "Aún no hay descargas.",
  "Aucun téléchargement.",
  "Nessun download."
 ],
 [
  "Ainda não existem registos.",
  "No records yet.",
  "Aún no hay registros.",
  "Aucun élément.",
  "Nessun record."
 ],
 [
  "Perfil removido",
  "Deleted profile",
  "Perfil eliminado",
  "Profil supprimé",
  "Profilo eliminato"
 ],
 [
  "Nunca",
  "Never",
  "Nunca",
  "Jamais",
  "Mai"
 ],
 [
  "Ligação direta",
  "Direct connection",
  "Conexión directa",
  "Connexion directe",
  "Connessione diretta"
 ],
 [
  "Mais ações",
  "More actions",
  "Más acciones",
  "Plus d'actions",
  "Altre azioni"
 ],
 [
  "Configurações exportadas, sem cookies nem palavras-passe.",
  "Settings exported without cookies or passwords.",
  "Configuración exportada sin cookies ni contraseñas.",
  "Paramètres exportés sans cookies ni mots de passe.",
  "Impostazioni esportate senza cookie né password."
 ],
 [
  "Perfil guardado.",
  "Profile saved.",
  "Perfil guardado.",
  "Profil enregistré.",
  "Profilo salvato."
 ],
 [
  "Grupo guardado.",
  "Group saved.",
  "Grupo guardado.",
  "Groupe enregistré.",
  "Gruppo salvato."
 ],
 [
  "Favorito atualizado.",
  "Bookmark updated.",
  "Marcador actualizado.",
  "Favori mis à jour.",
  "Preferito aggiornato."
 ],
 [
  "Dados selecionados limpos.",
  "Selected data cleared.",
  "Datos seleccionados borrados.",
  "Données sélectionnées effacées.",
  "Dati selezionati cancellati."
 ],
 [
  "Favorito guardado.",
  "Bookmark saved.",
  "Marcador guardado.",
  "Favori enregistré.",
  "Preferito salvato."
 ],
 [
  "Sessão encriptada",
  "Encrypted session",
  "Sesión cifrada",
  "Session chiffrée",
  "Sessione cifrata"
 ],
 [
  "Introduza a palavra-passe do ficheiro.",
  "Enter the file password.",
  "Introduce la contraseña del archivo.",
  "Saisissez le mot de passe du fichier.",
  "Inserisci la password del file."
 ],
 [
  "Partilhar sessão",
  "Share session",
  "Compartir sesión",
  "Partager la session",
  "Condividi sessione"
 ],
 [
  "{n} perfil(s) selecionado(s)",
  "{n} profile(s) selected",
  "{n} perfil(es) seleccionado(s)",
  "{n} profil(s) sélectionné(s)",
  "{n} profilo/i selezionato/i"
 ],
 [
  "{n} perfis",
  "{n} profiles",
  "{n} perfiles",
  "{n} profils",
  "{n} profili"
 ],
 [
  "{n} de {total} perfis",
  "{n} of {total} profiles",
  "{n} de {total} perfiles",
  "{n} sur {total} profils",
  "{n} di {total} profili"
 ],
 [
  "{n} grupo(s) selecionado(s)",
  "{n} group(s) selected",
  "{n} grupo(s) seleccionado(s)",
  "{n} groupe(s) sélectionné(s)",
  "{n} gruppo/i selezionato/i"
 ],
 [
  "Sem erros registados nesta execução.",
  "No errors in this session.",
  "Sin errores en esta sesión.",
  "Aucune erreur dans cette session.",
  "Nessun errore in questa sessione."
 ],
 [
  "Nos motores completos, instale e gira extensões no próprio navegador. No modo integrado, carregue uma pasta com manifest.json.",
  "Manage extensions in the full browser. In embedded mode, load a folder with manifest.json.",
  "Gestiona las extensiones en el navegador completo. En modo integrado, carga una carpeta con manifest.json.",
  "Gérez les extensions dans le navigateur complet. En mode intégré, chargez un dossier avec manifest.json.",
  "Gestisci le estensioni nel browser completo. In modalità integrata, carica una cartella con manifest.json."
 ],
 [
  "As extensões têm acesso às páginas do respetivo perfil. Instale apenas extensões em que confia. No modo integrado, a compatibilidade depende das APIs do Electron. Chrome e Edge completos utilizam os seus gestores e lojas de extensões.",
  "Extensions can access profile pages. Install only trusted extensions. Embedded mode is limited by Electron APIs. Full Chrome and Edge use their native extension managers and stores.",
  "Las extensiones acceden a las páginas del perfil. Instala solo extensiones de confianza. El modo integrado depende de las API de Electron. Chrome y Edge completos usan sus gestores y tiendas nativos.",
  "Les extensions accèdent aux pages du profil. Installez uniquement des extensions fiables. Le mode intégré dépend des API Electron. Chrome et Edge complets utilisent leurs gestionnaires et boutiques natifs.",
  "Le estensioni accedono alle pagine del profilo. Installa solo estensioni affidabili. La modalità integrata dipende dalle API Electron. Chrome ed Edge completi usano gestori e negozi nativi."
 ],
 [
  "Os motores completos apresentam as transferências no seu gestor nativo, acessível nas ações do perfil.",
  "Full browsers show downloads in their native manager, available from profile actions.",
  "Los navegadores completos muestran las descargas en su gestor nativo, desde las acciones del perfil.",
  "Les navigateurs complets affichent les téléchargements dans leur gestionnaire natif, accessible depuis les actions du profil.",
  "I browser completi mostrano i download nel gestore nativo, accessibile dalle azioni del profilo."
 ],
 [
  "O período aplica-se ao histórico. Os cookies, armazenamento dos sites e cache selecionados são limpos integralmente. Feche primeiro o perfil.",
  "The time range applies to history. Selected cookies, site storage and cache are cleared completely. Close the profile first.",
  "El período se aplica al historial. Las cookies, el almacenamiento y la caché seleccionados se borran por completo. Cierra primero el perfil.",
  "La période s'applique à l'historique. Les cookies, le stockage et le cache sélectionnés sont entièrement effacés. Fermez d'abord le profil.",
  "Il periodo si applica alla cronologia. Cookie, archiviazione e cache selezionati vengono cancellati completamente. Chiudi prima il profilo."
 ],
 [
  "Cada perfil tem cookies, LocalStorage, IndexedDB e cache independentes. As permissões dos sites são pedidas na janela do perfil. O tráfego usa o proxy apenas quando configurado.",
  "Each profile has separate cookies, LocalStorage, IndexedDB and cache. Site permissions are requested in its window. Traffic uses a proxy only when configured.",
  "Cada perfil tiene cookies, LocalStorage, IndexedDB y caché independientes. Los permisos se solicitan en su ventana. El tráfico usa proxy solo si se configura.",
  "Chaque profil possède ses propres cookies, LocalStorage, IndexedDB et cache. Les autorisations sont demandées dans sa fenêtre. Le trafic utilise un proxy uniquement s'il est configuré.",
  "Ogni profilo ha cookie, LocalStorage, IndexedDB e cache separati. I permessi vengono richiesti nella sua finestra. Il proxy viene usato solo se configurato."
 ],
 [
  "Os parâmetros de fuso horário, idioma, localização e tamanho da janela são aplicados ao navegador. O formulário permite restringir Canvas, WebGL, fontes, áudio e WebRTC. Os motores e trabalhadores Web podem expor superfícies adicionais; não é garantido anonimato nem prevenção de bloqueios.",
  "Time zone, language, location and window size are applied to the browser. Canvas, WebGL, fonts, audio and WebRTC can be restricted. Engines and Web Workers may expose additional information. Anonymity and protection from bans are not guaranteed.",
  "Se aplican zona horaria, idioma, ubicación y tamaño de ventana. Se pueden restringir Canvas, WebGL, fuentes, audio y WebRTC. Los motores y Web Workers pueden exponer información adicional. No se garantiza anonimato ni protección contra bloqueos.",
  "Le fuseau horaire, la langue, la position et la taille de fenêtre sont appliqués. Canvas, WebGL, polices, audio et WebRTC peuvent être restreints. Les moteurs et Web Workers peuvent exposer d'autres informations. Anonymat et protection contre les blocages ne sont pas garantis.",
  "Fuso orario, lingua, posizione e dimensioni sono applicati al browser. Canvas, WebGL, font, audio e WebRTC possono essere limitati. Motori e Web Worker possono esporre altre informazioni. Anonimato e protezione dai blocchi non sono garantiti."
 ],
 [
  "A exportação normal inclui apenas configurações, sem palavras-passe nem cookies. A partilha exige encriptação. Nos motores completos inclui cookies, LocalStorage, IndexedDB e armazenamento dos sites; no modo integrado inclui apenas cookies. Não inclui palavras-passe guardadas nem extensões, e não garante a transferência de autenticação dependente do dispositivo.",
  "Normal exports contain settings without passwords or cookies. Sharing requires encryption. Full browsers include cookies, LocalStorage, IndexedDB and site storage; embedded mode includes cookies only. Saved passwords and extensions are excluded. Device-bound authentication may not transfer.",
  "La exportación normal incluye configuración sin contraseñas ni cookies. Compartir requiere cifrado. Los navegadores completos incluyen cookies, LocalStorage, IndexedDB y datos de sitios; el modo integrado solo cookies. Se excluyen contraseñas guardadas y extensiones. La autenticación vinculada al dispositivo puede no transferirse.",
  "L'exportation normale contient les paramètres sans mots de passe ni cookies. Le partage exige un chiffrement. Les navigateurs complets incluent cookies, LocalStorage, IndexedDB et données des sites ; le mode intégré inclut seulement les cookies. Mots de passe enregistrés et extensions sont exclus. L'authentification liée à l'appareil peut ne pas être transférable.",
  "L'esportazione normale contiene impostazioni senza password né cookie. La condivisione richiede cifratura. I browser completi includono cookie, LocalStorage, IndexedDB e dati dei siti; la modalità integrata solo cookie. Password salvate ed estensioni sono escluse. L'autenticazione legata al dispositivo potrebbe non essere trasferibile."
 ],
 [
  "Escolha um motor completo para extensões e definições nativas.",
  "Choose a full browser for native extensions and settings.",
  "Elige un navegador completo para extensiones y ajustes nativos.",
  "Choisissez un navigateur complet pour les extensions et paramètres natifs.",
  "Scegli un browser completo per estensioni e impostazioni native."
 ],
 [
  "As palavras-passe são protegidas pelo Windows. A autenticação SOCKS não é suportada pelo motor Chromium.",
  "Passwords are protected by Windows. Chromium does not support SOCKS authentication.",
  "Windows protege las contraseñas. Chromium no admite autenticación SOCKS.",
  "Les mots de passe sont protégés par Windows. Chromium ne prend pas en charge l'authentification SOCKS.",
  "Le password sono protette da Windows. Chromium non supporta l'autenticazione SOCKS."
 ],
 [
  "Estas opções restringem APIs da página e podem afetar aplicações de vídeo, áudio, desenho e chamadas. Não garantem anonimato nem ausência de bloqueios. Trabalhadores Web têm contextos próprios.",
  "These options restrict page APIs and may affect video, audio, drawing and calls. They do not guarantee anonymity or protection from bans. Web Workers have separate contexts.",
  "Estas opciones restringen API y pueden afectar vídeo, audio, dibujo y llamadas. No garantizan anonimato ni ausencia de bloqueos. Los Web Workers tienen contextos propios.",
  "Ces options restreignent les API et peuvent affecter vidéo, audio, dessin et appels. Elles ne garantissent ni anonymat ni absence de blocages. Les Web Workers ont des contextes distincts.",
  "Queste opzioni limitano le API e possono influire su video, audio, disegno e chiamate. Non garantiscono anonimato né assenza di blocchi. I Web Worker hanno contesti separati."
 ],
 [
  "Navegador completo numa janela própria, com extensões, loja e definições nativas. Os dados são exclusivos deste perfil. Mudar de motor não migra sessões existentes.",
  "Full browser in its own window, with native extensions, store and settings. Data belongs only to this profile. Switching engines does not migrate existing sessions.",
  "Navegador completo en su ventana, con extensiones, tienda y ajustes nativos. Los datos son exclusivos de este perfil. Cambiar de motor no migra las sesiones existentes.",
  "Navigateur complet dans sa fenêtre, avec extensions, boutique et paramètres natifs. Les données sont propres au profil. Changer de moteur ne migre pas les sessions existantes.",
  "Browser completo in una finestra propria, con estensioni, negozio e impostazioni native. I dati appartengono al profilo. Cambiare motore non migra le sessioni esistenti."
 ],
 [
  "Navegador integrado. Suporte parcial de extensões Chromium.",
  "Embedded browser. Partial Chromium extension support.",
  "Navegador integrado. Soporte parcial de extensiones Chromium.",
  "Navigateur intégré. Prise en charge partielle des extensions Chromium.",
  "Browser integrato. Supporto parziale delle estensioni Chromium."
 ],
 [
  "Criar perfis em lote",
  "Create profiles in bulk",
  "Crear perfiles en lote",
  "Créer des profils en lot",
  "Crea profili in blocco"
 ],
 [
  "Escreva os nomes separados por ponto e vírgula. Máximo de 100 por lote.",
  "Enter names separated by semicolons. Up to 100 per batch.",
  "Escribe nombres separados por punto y coma. Máximo 100 por lote.",
  "Saisissez les noms séparés par des points-virgules. 100 maximum par lot.",
  "Inserisci i nomi separati da punto e virgola. Massimo 100 per blocco."
 ],
 [
  "Sem perfis para apresentar.",
  "No profiles to show.",
  "No hay perfiles para mostrar.",
  "Aucun profil à afficher.",
  "Nessun profilo da mostrare."
 ],
 [
  "Grupo Z–A",
  "Group Z–A",
  "Grupo Z–A",
  "Groupe Z–A",
  "Gruppo Z–A"
 ],
 [
  "Estado inverso",
  "Reverse status",
  "Estado inverso",
  "État inversé",
  "Stato inverso"
 ],
 [
  "Selecionar perfil",
  "Select profile",
  "Seleccionar perfil",
  "Sélectionner le profil",
  "Seleziona profilo"
 ],
 [
  "Selecionar grupo",
  "Select group",
  "Seleccionar grupo",
  "Sélectionner le groupe",
  "Seleziona gruppo"
 ],
 [
  "completo",
  "full",
  "completo",
  "complet",
  "completo"
 ],
 [
  "Integrado",
  "Embedded",
  "Integrado",
  "Intégré",
  "Integrato"
 ],
 [
  "indisponível",
  "unavailable",
  "no disponible",
  "indisponible",
  "non disponibile"
 ],
 [
  "A carregar…",
  "Loading…",
  "Cargando…",
  "Chargement…",
  "Caricamento…"
 ],
 [
  "Acompanhe os ficheiros transferidos por cada perfil.",
  "Track downloads for each profile.",
  "Consulta las descargas de cada perfil.",
  "Suivez les téléchargements de chaque profil.",
  "Segui i download di ogni profilo."
 ],
 [
  "Organize os seus perfis por equipa, cliente ou projeto.",
  "Organize profiles by team, client or project.",
  "Organiza perfiles por equipo, cliente o proyecto.",
  "Organisez les profils par équipe, client ou projet.",
  "Organizza profili per team, cliente o progetto."
 ],
 [
  "Volte às páginas que fazem parte do seu trabalho.",
  "Return to the pages you use for work.",
  "Vuelve a las páginas de tu trabajo.",
  "Retrouvez vos pages de travail.",
  "Ritrova le pagine del tuo lavoro."
 ],
 [
  "As páginas importantes de cada perfil, sempre à mão.",
  "Keep each profile's important pages close at hand.",
  "Las páginas importantes de cada perfil, siempre a mano.",
  "Les pages importantes de chaque profil, toujours accessibles.",
  "Le pagine importanti di ogni profilo, sempre a portata di mano."
 ],
 [
  "Personalize cada perfil com ferramentas de confiança.",
  "Customize profiles with trusted tools.",
  "Personaliza perfiles con herramientas de confianza.",
  "Personnalisez les profils avec des outils fiables.",
  "Personalizza i profili con strumenti affidabili."
 ],
 [
  "O seu navegador, à sua maneira.",
  "Your browser, your way.",
  "Tu navegador, a tu manera.",
  "Votre navigateur, à votre façon.",
  "Il tuo browser, a modo tuo."
 ],
 [
  "Feche este perfil antes de o editar.",
  "Close this profile before editing.",
  "Cierra este perfil antes de editarlo.",
  "Fermez ce profil avant de le modifier.",
  "Chiudi il profilo prima di modificarlo."
 ],
 [
  "Feche este perfil antes de alterar a configuração.",
  "Close this profile before changing its settings.",
  "Cierra este perfil antes de cambiar la configuración.",
  "Fermez ce profil avant de modifier ses paramètres.",
  "Chiudi il profilo prima di modificarne le impostazioni."
 ],
 [
  "Selecione pelo menos um perfil.",
  "Select at least one profile.",
  "Selecciona al menos un perfil.",
  "Sélectionnez au moins un profil.",
  "Seleziona almeno un profilo."
 ],
 [
  "Selecione pelo menos um grupo.",
  "Select at least one group.",
  "Selecciona al menos un grupo.",
  "Sélectionnez au moins un groupe.",
  "Seleziona almeno un gruppo."
 ],
 [
  "Crie um perfil para adicionar extensões.",
  "Create a profile to add extensions.",
  "Crea un perfil para añadir extensiones.",
  "Créez un profil pour ajouter des extensions.",
  "Crea un profilo per aggiungere estensioni."
 ],
 [
  "{n} perfil(s) importado(s).",
  "{n} profile(s) imported.",
  "{n} perfil(es) importado(s).",
  "{n} profil(s) importé(s).",
  "{n} profilo/i importato/i."
 ],
 [
  "{n} perfis criados.",
  "{n} profiles created.",
  "{n} perfiles creados.",
  "{n} profils créés.",
  "{n} profili creati."
 ],
 [
  "{n} perfis eliminados.",
  "{n} profiles deleted.",
  "{n} perfiles eliminados.",
  "{n} profils supprimés.",
  "{n} profili eliminati."
 ],
 [
  "{n} perfis abertos (máximo de 10 por operação).",
  "{n} profiles opened (up to 10 per operation).",
  "{n} perfiles abiertos (máximo 10 por operación).",
  "{n} profils ouverts (10 maximum par opération).",
  "{n} profili aperti (massimo 10 per operazione)."
 ],
 [
  "{n} extensão(ões)",
  "{n} extension(s)",
  "{n} extensión(es)",
  "{n} extension(s)",
  "{n} estensione/i"
 ],
 [
  "Extensões geridas no navegador {engine}",
  "Extensions managed in {engine}",
  "Extensiones gestionadas en {engine}",
  "Extensions gérées dans {engine}",
  "Estensioni gestite in {engine}"
 ],
 [
  "Será utilizado o User-Agent nativo deste navegador.",
  "This browser's native User-Agent will be used.",
  "Se usará el User-Agent nativo del navegador.",
  "Le User-Agent natif du navigateur sera utilisé.",
  "Verrà usato lo User-Agent nativo del browser."
 ],
 [
  "CSV exportado sem palavras-passe nem cookies.",
  "CSV exported without passwords or cookies.",
  "CSV exportado sin contraseñas ni cookies.",
  "CSV exporté sans mots de passe ni cookies.",
  "CSV esportato senza password né cookie."
 ],
 [
  "Sem erros registados nesta execução.",
  "No errors recorded in this session.",
  "Sin errores en esta sesión.",
  "Aucune erreur enregistrée dans cette session.",
  "Nessun errore registrato nella sessione."
 ],
 [
  "Nunca",
  "Never",
  "Nunca",
  "Jamais",
  "Mai"
 ],
 [
  "Limpar",
  "Clear",
  "Borrar",
  "Effacer",
  "Cancella"
 ],
 [
  "Eliminar",
  "Delete",
  "Eliminar",
  "Supprimer",
  "Elimina"
 ],
 [
  "Permitir",
  "Allow",
  "Permitir",
  "Autoriser",
  "Consenti"
 ],
 [
  "Recusar",
  "Deny",
  "Denegar",
  "Refuser",
  "Nega"
 ],
 [
  "Fechar tudo",
  "Close all",
  "Cerrar todo",
  "Tout fermer",
  "Chiudi tutto"
 ],
 [
  "Reabrir separador fechado",
  "Reopen closed tab",
  "Reabrir pestaña cerrada",
  "Rouvrir l'onglet fermé",
  "Riapri scheda chiusa"
 ],
 [
  "Mostrar barra de favoritos",
  "Show bookmarks bar",
  "Mostrar barra de marcadores",
  "Afficher la barre de favoris",
  "Mostra barra preferiti"
 ],
 [
  "Gerir favoritos",
  "Manage bookmarks",
  "Gestionar marcadores",
  "Gérer les favoris",
  "Gestisci preferiti"
 ],
 [
  "Historico",
  "History",
  "Historial",
  "Historique",
  "Cronologia"
 ],
 [
  "Transferencias",
  "Downloads",
  "Descargas",
  "Téléchargements",
  "Download"
 ],
 [
  "Extensoes",
  "Extensions",
  "Extensiones",
  "Extensions",
  "Estensioni"
 ],
 [
  "Procurar na pagina",
  "Find in page",
  "Buscar en la página",
  "Rechercher dans la page",
  "Trova nella pagina"
 ],
 [
  "Imprimir",
  "Print",
  "Imprimir",
  "Imprimer",
  "Stampa"
 ],
 [
  "Guardar pagina",
  "Save page",
  "Guardar página",
  "Enregistrer la page",
  "Salva pagina"
 ],
 [
  "Copiar endereco",
  "Copy address",
  "Copiar dirección",
  "Copier l'adresse",
  "Copia indirizzo"
 ],
 [
  "Definicoes",
  "Settings",
  "Configuración",
  "Paramètres",
  "Impostazioni"
 ],
 [
  "Fechar janela",
  "Close window",
  "Cerrar ventana",
  "Fermer la fenêtre",
  "Chiudi finestra"
 ],
 [
  "Estilo do gestor",
  "Manager layout",
  "Estilo del gestor",
  "Style du gestionnaire",
  "Stile del gestore"
 ],
 [
  "Moderno",
  "Modern",
  "Moderno",
  "Moderne",
  "Moderno"
 ],
 [
  "Clássico",
  "Classic",
  "Clásico",
  "Classique",
  "Classico"
 ],
 [
  "Perfil do navegador completo",
  "Full browser profile",
  "Perfil del navegador completo",
  "Profil du navigateur complet",
  "Profilo del browser completo"
 ],
 [
  "Abrir no navegador",
  "Open in browser",
  "Abrir en el navegador",
  "Ouvrir dans le navigateur",
  "Apri nel browser"
 ],
 [
  "Página aberta no navegador.",
  "Page opened in browser.",
  "Página abierta en el navegador.",
  "Page ouverte dans le navigateur.",
  "Pagina aperta nel browser."
 ],
 [
  "Aplicar fuso horário",
  "Override time zone",
  "Aplicar zona horaria",
  "Appliquer le fuseau horaire",
  "Applica fuso orario"
 ],
 [
  "Aplicar localização",
  "Override location",
  "Aplicar ubicación",
  "Appliquer la position",
  "Applica posizione"
 ],
 [
  "Fuso do sistema",
  "System time zone",
  "Zona horaria del sistema",
  "Fuseau horaire du système",
  "Fuso orario del sistema"
 ],
 [
  "Pesquisar registos",
  "Search records",
  "Buscar registros",
  "Rechercher des entrées",
  "Cerca record"
 ],
 [
  "Todos os perfis",
  "All profiles",
  "Todos los perfiles",
  "Tous les profils",
  "Tutti i profili"
 ],
 [
  "Registos por página",
  "Records per page",
  "Registros por página",
  "Entrées par page",
  "Record per pagina"
 ],
 [
  "Título A–Z",
  "Title A–Z",
  "Título A–Z",
  "Titre A–Z",
  "Titolo A–Z"
 ],
 [
  "Título Z–A",
  "Title Z–A",
  "Título Z–A",
  "Titre Z–A",
  "Titolo Z–A"
 ],
 [
  "Endereço A–Z",
  "Address A–Z",
  "Dirección A–Z",
  "Adresse A–Z",
  "Indirizzo A–Z"
 ],
 [
  "Endereço Z–A",
  "Address Z–A",
  "Dirección Z–A",
  "Adresse Z–A",
  "Indirizzo Z–A"
 ],
 [
  "{n} registo(s)",
  "{n} record(s)",
  "{n} registro(s)",
  "{n} entrée(s)",
  "{n} record"
 ],
 [
  "Escreva LIMPAR para apagar {n} registo(s) filtrado(s) do gestor. Os cookies e o histórico nativo não são alterados.",
  "Type LIMPAR to delete {n} filtered record(s) from the manager. Cookies and native history remain unchanged.",
  "Escriba LIMPAR para borrar {n} registro(s) filtrado(s) del gestor. Las cookies y el historial nativo se conservan.",
  "Saisissez LIMPAR pour supprimer {n} entrée(s) filtrée(s) du gestionnaire. Les cookies et l’historique natif sont conservés.",
  "Scrivi LIMPAR per eliminare {n} record filtrati dal gestore. Cookie e cronologia nativa vengono conservati."
 ],
 [
  "Parar carregamento",
  "Stop loading",
  "Detener carga",
  "Arrêter le chargement",
  "Interrompi caricamento"
 ],
 [
  "Repor zoom",
  "Reset zoom",
  "Restablecer zoom",
  "Réinitialiser le zoom",
  "Reimposta zoom"
 ],
 [
  "Já existe um favorito com este endereço neste perfil.",
  "This profile already has a bookmark with this address.",
  "Este perfil ya tiene un favorito con esta dirección.",
  "Ce profil contient déjà un favori avec cette adresse.",
  "Questo profilo ha già un preferito con questo indirizzo."
 ],
 [
  "Endereço da página de arranque",
  "Startup page address",
  "Dirección de la página de inicio",
  "Adresse de la page de démarrage",
  "Indirizzo della pagina iniziale"
 ],
 [
  "Adicionar página",
  "Add page",
  "Añadir página",
  "Ajouter une page",
  "Aggiungi pagina"
 ],
 [
  "Guardar página",
  "Save page",
  "Guardar página",
  "Enregistrer la page",
  "Salva pagina"
 ],
 [
  "Cancelar edição",
  "Cancel edit",
  "Cancelar edición",
  "Annuler la modification",
  "Annulla modifica"
 ],
 [
  "Editar lista como texto",
  "Edit list as text",
  "Editar lista como texto",
  "Modifier la liste en texte",
  "Modifica elenco come testo"
 ],
 [
  "Indique um endereço para a página de arranque.",
  "Enter an address for the startup page.",
  "Introduzca una dirección para la página de inicio.",
  "Saisissez une adresse pour la page de démarrage.",
  "Inserisci un indirizzo per la pagina iniziale."
 ],
 [
  "Máximo de 10 páginas de arranque.",
  "A maximum of 10 startup pages is allowed.",
  "Se permiten hasta 10 páginas de inicio.",
  "Un maximum de 10 pages de démarrage est autorisé.",
  "Sono consentite al massimo 10 pagine iniziali."
 ],
 [
  "Ordenar",
  "Sort",
  "Ordenar",
  "Trier",
  "Ordina"
 ],
 [
  "Mais perfis",
  "Most profiles",
  "Más perfiles",
  "Plus de profils",
  "Più profili"
 ],
 [
  "Menos perfis",
  "Fewest profiles",
  "Menos perfiles",
  "Moins de profils",
  "Meno profili"
 ],
 [
  "Descrição A–Z",
  "Description A–Z",
  "Descripción A–Z",
  "Description A–Z",
  "Descrizione A–Z"
 ],
 [
  "Descrição Z–A",
  "Description Z–A",
  "Descripción Z–A",
  "Description Z–A",
  "Descrizione Z–A"
 ],
 [
  "Selecionar todos os resultados",
  "Select all results",
  "Seleccionar todos los resultados",
  "Sélectionner tous les résultats",
  "Seleziona tutti i risultati"
 ],
 [
  "Ir para página de grupos",
  "Go to group page",
  "Ir a la página de grupos",
  "Aller à la page des groupes",
  "Vai alla pagina dei gruppi"
 ],
 [
  "{n} grupo(s)",
  "{n} group(s)",
  "{n} grupo(s)",
  "{n} groupe(s)",
  "{n} gruppi"
 ],
 [
  "Abrir seleção",
  "Open selection",
  "Abrir selección",
  "Ouvrir la sélection",
  "Apri selezione"
 ],
 [
  "Abrir todos",
  "Open all",
  "Abrir todos",
  "Tout ouvrir",
  "Apri tutti"
 ],
 [
  "Fixar",
  "Pin",
  "Fijar",
  "Épingler",
  "Fissa"
 ],
 [
  "Não foi possível abrir: {names}.",
  "Could not open: {names}.",
  "No se pudo abrir: {names}.",
  "Impossible d’ouvrir : {names}.",
  "Impossibile aprire: {names}."
 ],
 [
  "{n} perfis ficaram fora do limite desta operação.",
  "{n} profiles exceeded the limit for this operation.",
  "{n} perfiles superaron el límite de esta operación.",
  "{n} profils dépassent la limite de cette opération.",
  "{n} profili superano il limite di questa operazione."
 ],
 [
  "Chromium portátil",
  "Portable Chromium",
  "Chromium portátil",
  "Chromium portable",
  "Chromium portatile"
 ],
 [
  "Chromium portátil incluído. Revisão experimental; atualizações manuais.",
  "Portable Chromium included. Experimental snapshot; manual updates.",
  "Chromium portátil incluido. Revisión experimental; actualizaciones manuales.",
  "Chromium portable inclus. Version expérimentale ; mises à jour manuelles.",
  "Chromium portatile incluso. Revisione sperimentale; aggiornamenti manuali."
 ],
 [
  "Ecrã inteiro",
  "Full screen",
  "Pantalla completa",
  "Plein écran",
  "Schermo intero"
 ],
 [
  "Duplicar separador",
  "Duplicate tab",
  "Duplicar pestaña",
  "Dupliquer l’onglet",
  "Duplica scheda"
 ],
 [
  "Silenciar separador",
  "Mute tab",
  "Silenciar pestaña",
  "Couper le son de l’onglet",
  "Disattiva audio scheda"
 ],
 [
  "Mover para a esquerda",
  "Move left",
  "Mover a la izquierda",
  "Déplacer à gauche",
  "Sposta a sinistra"
 ],
 [
  "Mover para a direita",
  "Move right",
  "Mover a la derecha",
  "Déplacer à droite",
  "Sposta a destra"
 ],
 [
  "Fechar outros separadores",
  "Close other tabs",
  "Cerrar otras pestañas",
  "Fermer les autres onglets",
  "Chiudi altre schede"
 ],
 [
  "Fechar separadores à direita",
  "Close tabs to the right",
  "Cerrar pestañas a la derecha",
  "Fermer les onglets à droite",
  "Chiudi schede a destra"
 ],
 [
  "Anular",
  "Undo",
  "Deshacer",
  "Annuler",
  "Annulla"
 ],
 [
  "Refazer",
  "Redo",
  "Rehacer",
  "Rétablir",
  "Ripeti"
 ],
 [
  "Cortar",
  "Cut",
  "Cortar",
  "Couper",
  "Taglia"
 ],
 [
  "Copiar",
  "Copy",
  "Copiar",
  "Copier",
  "Copia"
 ],
 [
  "Colar",
  "Paste",
  "Pegar",
  "Coller",
  "Incolla"
 ],
 [
  "Colar sem formatação",
  "Paste as plain text",
  "Pegar sin formato",
  "Coller sans mise en forme",
  "Incolla senza formattazione"
 ],
 [
  "Selecionar tudo",
  "Select all",
  "Seleccionar todo",
  "Tout sélectionner",
  "Seleziona tutto"
 ],
 [
  "Abrir ligação num novo separador",
  "Open link in new tab",
  "Abrir enlace en nueva pestaña",
  "Ouvrir le lien dans un nouvel onglet",
  "Apri link in nuova scheda"
 ],
 [
  "Abrir ligação e mudar de separador",
  "Open link and switch to tab",
  "Abrir enlace y cambiar de pestaña",
  "Ouvrir le lien et afficher son onglet",
  "Apri link e passa alla scheda"
 ],
 [
  "Copiar endereço da ligação",
  "Copy link address",
  "Copiar dirección del enlace",
  "Copier l’adresse du lien",
  "Copia indirizzo link"
 ],
 [
  "Guardar ligação como…",
  "Save link as…",
  "Guardar enlace como…",
  "Enregistrer le lien sous…",
  "Salva link con nome…"
 ],
 [
  "Abrir imagem num novo separador",
  "Open image in new tab",
  "Abrir imagen en nueva pestaña",
  "Ouvrir l’image dans un nouvel onglet",
  "Apri immagine in nuova scheda"
 ],
 [
  "Copiar endereço da imagem",
  "Copy image address",
  "Copiar dirección de imagen",
  "Copier l’adresse de l’image",
  "Copia indirizzo immagine"
 ],
 [
  "Guardar imagem como…",
  "Save image as…",
  "Guardar imagen como…",
  "Enregistrer l’image sous…",
  "Salva immagine con nome…"
 ],
 [
  "Copiar imagem",
  "Copy image",
  "Copiar imagen",
  "Copier l’image",
  "Copia immagine"
 ],
 [
  "Abrir multimédia num novo separador",
  "Open media in new tab",
  "Abrir multimedia en nueva pestaña",
  "Ouvrir le média dans un nouvel onglet",
  "Apri media in nuova scheda"
 ],
 [
  "Copiar endereço multimédia",
  "Copy media address",
  "Copiar dirección multimedia",
  "Copier l’adresse du média",
  "Copia indirizzo media"
 ],
 [
  "Guardar multimédia como…",
  "Save media as…",
  "Guardar multimedia como…",
  "Enregistrer le média sous…",
  "Salva media con nome…"
 ],
 [
  "Pesquisar texto selecionado",
  "Search selected text",
  "Buscar texto seleccionado",
  "Rechercher le texte sélectionné",
  "Cerca testo selezionato"
 ],
 [
  "Grupos do perfil",
  "Profile groups",
  "Grupos del perfil",
  "Groupes du profil",
  "Gruppi del profilo"
 ],
 [
  "Adicionar grupo",
  "Add group",
  "Añadir grupo",
  "Ajouter un groupe",
  "Aggiungi gruppo"
 ],
 [
  "Selecione vários grupos sem duplicar o perfil.",
  "Select several groups without duplicating the profile.",
  "Selecciona varios grupos sin duplicar el perfil.",
  "Sélectionnez plusieurs groupes sans dupliquer le profil.",
  "Seleziona più gruppi senza duplicare il profilo."
 ],
 [
  "Exportar grupos CSV",
  "Export groups CSV",
  "Exportar grupos CSV",
  "Exporter les groupes CSV",
  "Esporta gruppi CSV"
 ],
 [
  "Exportar grupos JSON",
  "Export groups JSON",
  "Exportar grupos JSON",
  "Exporter les groupes JSON",
  "Esporta gruppi JSON"
 ],
 [
  "Importar grupos",
  "Import groups",
  "Importar grupos",
  "Importer des groupes",
  "Importa gruppi"
 ],
 [
  "Grupos e descrições exportados.",
  "Groups and descriptions exported.",
  "Grupos y descripciones exportados.",
  "Groupes et descriptions exportés.",
  "Gruppi e descrizioni esportati."
 ],
 [
  "{n} perfil(s) e {g} grupo(s) importado(s).",
  "{n} profile(s) and {g} group(s) imported.",
  "{n} perfil(es) y {g} grupo(s) importados.",
  "{n} profil(s) et {g} groupe(s) importés.",
  "{n} profili e {g} gruppi importati."
 ],
 [
  "A exportação inclui os grupos selecionados ou todos, com as descrições. Ao importar, os grupos com o mesmo nome recebem a descrição do ficheiro.",
  "Export includes selected groups, or all groups, with descriptions. Import updates descriptions of groups with the same name.",
  "La exportación incluye los grupos seleccionados o todos, con descripciones. La importación actualiza las descripciones de grupos con el mismo nombre.",
  "L’export inclut les groupes sélectionnés ou tous les groupes, avec descriptions. L’import met à jour les descriptions des groupes portant le même nom.",
  "L’esportazione include i gruppi selezionati o tutti, con descrizioni. L’importazione aggiorna le descrizioni dei gruppi con lo stesso nome."
 ],
 [
  "Adicionar",
  "Add",
  "Añadir",
  "Ajouter",
  "Aggiungi"
 ],
 [
  "Integrado (Electron)",
  "Embedded (Electron)",
  "Integrado (Electron)",
  "Intégré (Electron)",
  "Integrato (Electron)"
 ],
 [
  "Criado por:",
  "Created by:",
  "Creado por:",
  "Créé par :",
  "Creato da:"
 ],
 [
  "Mais Produtos em:",
  "More products at:",
  "Más productos en:",
  "Plus de produits sur :",
  "Altri prodotti su:"
 ],
 [
  "Motores completos:",
  "Full browsers:",
  "Navegadores completos:",
  "Navigateurs complets :",
  "Browser completi:"
 ],
 [
  "Nenhum encontrado",
  "None found",
  "Ninguno encontrado",
  "Aucun trouvé",
  "Nessuno trovato"
 ],
 [
  "Permissão do site",
  "Site permission",
  "Permiso del sitio",
  "Autorisation du site",
  "Autorizzazione del sito"
 ],
 [
  "{origin} pede {permission}",
  "{origin} requests {permission}",
  "{origin} solicita {permission}",
  "{origin} demande {permission}",
  "{origin} richiede {permission}"
 ],
 [
  "Guardar ficheiro",
  "Save file",
  "Guardar archivo",
  "Enregistrer le fichier",
  "Salva file"
 ],
 [
  "Exportação encriptada",
  "Encrypted export",
  "Exportación cifrada",
  "Export chiffré",
  "Esportazione crittografata"
 ],
 [
  "Exportar configurações",
  "Export settings",
  "Exportar configuración",
  "Exporter les paramètres",
  "Esporta impostazioni"
 ],
 [
  "Importar perfis JSON ou CSV",
  "Import profiles JSON or CSV",
  "Importar perfiles JSON o CSV",
  "Importer des profils JSON ou CSV",
  "Importa profili JSON o CSV"
 ],
 [
  "Página HTML",
  "HTML page",
  "Página HTML",
  "Page HTML",
  "Pagina HTML"
 ],
 [
  "Eliminar {n} perfis e respetivos dados de navegação?",
  "Delete {n} profiles and their browsing data?",
  "¿Eliminar {n} perfiles y sus datos de navegación?",
  "Supprimer {n} profils et leurs données de navigation ?",
  "Eliminare {n} profili e i relativi dati di navigazione?"
 ],
 [
  "Remover {n} grupos? Os perfis e as outras associações serão conservados.",
  "Remove {n} groups? Profiles and other memberships will be kept.",
  "¿Eliminar {n} grupos? Se conservarán los perfiles y sus otras asociaciones.",
  "Supprimer {n} groupes ? Les profils et leurs autres associations seront conservés.",
  "Rimuovere {n} gruppi? I profili e le altre associazioni verranno mantenuti."
 ],
 [
  "Eliminar “{name}” e os respetivos dados de navegação?",
  "Delete “{name}” and its browsing data?",
  "¿Eliminar «{name}» y sus datos de navegación?",
  "Supprimer « {name} » et ses données de navigation ?",
  "Eliminare “{name}” e i relativi dati di navigazione?"
 ],
 [
  "Limpar os dados selecionados de {name}? O período aplica-se ao histórico; dados dos sites e cache são limpos integralmente.",
  "Clear selected data from {name}? The time range applies to history; site data and cache are cleared completely.",
  "¿Borrar los datos seleccionados de {name}? El período se aplica al historial; los datos de sitios y la caché se borran por completo.",
  "Effacer les données sélectionnées de {name} ? La période concerne l’historique ; les données des sites et le cache sont entièrement effacés.",
  "Cancellare i dati selezionati di {name}? Il periodo si applica alla cronologia; dati dei siti e cache vengono cancellati completamente."
 ],
 [
  "Limpar cookies, sessões e cache deste perfil? Os sites vão terminar a sessão.",
  "Clear cookies, sessions and cache for this profile? Sites will sign you out.",
  "¿Borrar cookies, sesiones y caché de este perfil? Los sitios cerrarán la sesión.",
  "Effacer les cookies, sessions et cache de ce profil ? Les sites vous déconnecteront.",
  "Cancellare cookie, sessioni e cache di questo profilo? I siti disconnetteranno l’utente."
 ],
 [
  "Selecionar extensão descompactada com manifest.json",
  "Select unpacked extension with manifest.json",
  "Seleccionar extensión descomprimida con manifest.json",
  "Sélectionner une extension décompressée avec manifest.json",
  "Seleziona estensione non compressa con manifest.json"
 ],
 [
  "Fechar o gestor e todas as janelas de navegação?",
  "Close the manager and all browser windows?",
  "¿Cerrar el gestor y todas las ventanas del navegador?",
  "Fermer le gestionnaire et toutes les fenêtres du navigateur ?",
  "Chiudere il gestore e tutte le finestre del browser?"
 ],
 [
  "Utilize um endereço HTTP ou HTTPS sem credenciais.",
  "Use an HTTP or HTTPS address without credentials.",
  "Utilice una dirección HTTP o HTTPS sin credenciales.",
  "Utilisez une adresse HTTP ou HTTPS sans identifiants.",
  "Usa un indirizzo HTTP o HTTPS senza credenziali."
 ],
 [
  "Ações",
  "Actions",
  "Acciones",
  "Actions",
  "Azioni"
 ],
 [
  "0 perfis",
  "0 profiles",
  "0 perfiles",
  "0 profils",
  "0 profili"
 ]
];
const table=new Map(MESSAGES.map(row=>[row[0].toLocaleLowerCase('pt-PT'),row]));
let language=DEFAULT_LANGUAGE;
export function setLanguage(value){language=normalizeLanguage(value);return language;}
export function t(value,selected=language){
 const source=String(value??''),locale=normalizeLanguage(selected);if(locale==='pt')return source;
 const key=source.trim(),prefix=key.match(/^[^\p{L}\p{N}]+/u)?.[0]||'',plain=key.slice(prefix.length);
 let row=table.get(key.toLocaleLowerCase('pt-PT')),icon='';
 if(!row){row=table.get(plain.toLocaleLowerCase('pt-PT'));icon=prefix;}
 if(!row)return source;
 const index={en:1,es:2,fr:3,it:4}[locale];
 let translated=index?row[index]:EXTRA_TRANSLATIONS[row[1]]?.[{hi:0,ar:1,zh:2,bn:3,ru:4,id:5}[locale]];
 translated||=row[1];
 if(plain===plain.toLocaleUpperCase('pt-PT')&&plain!==plain.toLocaleLowerCase('pt-PT'))translated=translated.toLocaleUpperCase(locale);
 return icon+translated;
}
export function f(template,values){return t(template).replace(/\{(\w+)\}/g,(_,key)=>String(values[key]??''));}
export function localizeDocument(document){
 const pageTitle=document.title;
 const text=[],attributes=[],walker=document.createTreeWalker(document.body,4);
 for(let node;(node=walker.nextNode());){
  if(node.parentElement?.closest('script,style,[data-no-translate]'))continue;
  const source=node.nodeValue;if(source.trim())text.push({node,source});
 }
 for(const element of document.querySelectorAll('[title],[placeholder],[aria-label]')){
  for(const attribute of ['title','placeholder','aria-label'])if(element.hasAttribute(attribute))attributes.push({element,attribute,source:element.getAttribute(attribute)});
 }
 return selected=>{
  setLanguage(selected);if(table.has(pageTitle.trim().toLocaleLowerCase('pt-PT')))document.title=t(pageTitle);document.documentElement.lang=language;document.documentElement.dir=languageDirection(language);
  for(const item of text)if(item.node.isConnected){const match=item.source.match(/^(\s*)([\s\S]*?)(\s*)$/);item.node.nodeValue=match[1]+t(match[2])+match[3];}
  for(const item of attributes)if(item.element.isConnected)item.element.setAttribute(item.attribute,t(item.source));
 };
}
