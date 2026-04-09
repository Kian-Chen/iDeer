import { useEffect, useMemo, useRef, useState } from "react";
import {
  checkHealth,
  getAboutInfo,
  getConfig,
  getHistory,
  getPublicMeta,
  getResults,
  openRunSocket,
  saveConfig,
  testOpenAICompatibleApi,
} from "./api";
import {
  ControlCenter,
  HomeView,
  LibraryView,
  SidebarButton,
  TitleBar,
} from "./desktopViews";
import {
  closeWindow,
  isTauriDesktop,
  openExternalUrl,
  openControlPanelWindow,
  startManagedBackend,
  stopManagedBackend,
} from "./desktop";
import {
  COPY,
  resolveLanguage,
  resolveTheme,
  type LanguagePreference,
  type ThemePreference,
} from "./copy";
import type {
  AboutInfo,
  AvatarId,
  ConfigData,
  HistoryEntry,
  PublicMeta,
  ResultSet,
  RunCompleteMessage,
  RunMessage,
  RunRequest,
  SourceName,
  UserProfile,
} from "./types";
import iconArxiv from "./assets/icon_arxiv.svg";
import avatar0 from "./assets/avatar/0.svg";
import avatar1 from "./assets/avatar/1.svg";
import avatar2 from "./assets/avatar/2.svg";
import avatar3 from "./assets/avatar/3.svg";
import iconGitHub from "./assets/icon_github.svg";
import iconGitHubWhite from "./assets/icon_github.white.svg";
import iconHF from "./assets/icon_hf.svg";
import iconIDeer from "./assets/icon_ideer.svg";
import iconX from "./assets/icon_x.svg";
import iconXBlack from "./assets/icon_x.black.svg";
import "./desktop.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faFolderOpen, faHouse, faStar } from "@fortawesome/free-solid-svg-icons";

type ViewName = "home" | "library";
type RunState = "idle" | "running" | "done" | "error";
type ControlPanel = "none" | "settings";
type SettingsTab = "profile" | "preferences" | "subscriptions" | "mail" | "info";

const DEFAULT_CONFIG: ConfigData = {
  provider: "openai", model: "gpt-4o-mini", base_url: "", api_key: "", temperature: 0.5,
  smtp_server: "", smtp_port: 465, sender: "", receiver: "", smtp_password: "",
  gh_languages: "all", gh_since: "daily", gh_max_repos: 30,
  hf_content_types: ["papers", "models"], hf_max_papers: 30, hf_max_models: 15,
  description: "", researcher_profile: "", x_rapidapi_key: "",
  x_rapidapi_host: "twitter-api45.p.rapidapi.com", x_accounts: "",
  arxiv_categories: "cs.AI", arxiv_max_entries: 100, arxiv_max_papers: 60,
};

const DEFAULT_RUN_FORM: RunRequest = {
  sources: ["github", "huggingface", "arxiv"], generate_report: true, generate_ideas: false,
  save: true, receiver: "", description: "", researcher_profile: "", scholar_url: "",
  x_accounts_input: "", delivery_mode: "combined_report",
};

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  receiver: "",
  focus: "",
  avatar: "2",
};

const AVATARS = [
  { key: "0", src: avatar0 },
  { key: "1", src: avatar1 },
  { key: "2", src: avatar2 },
  { key: "3", src: avatar3 },
] satisfies Array<{ key: AvatarId; src: string }>;

const DEFAULT_ABOUT_INFO: AboutInfo = {
  github_url: "https://github.com/LiYu0524/iDeer/",
  contributors: [
    { name: "Yu Li", github_id: "LiYu0524", url: "https://yuli-cs.net" },
    { name: "Tianle Hu", github_id: "Horiz21", url: "https://hutianle.com" },
  ],
};

const SOURCES = [
  { key: "github", label: "GitHub", description: "Trending 仓库和工程动态", iconLight: iconGitHub, iconDark: iconGitHubWhite, iconActive: iconGitHubWhite },
  { key: "huggingface", label: "HuggingFace", description: "论文与模型动态", iconLight: iconHF, iconDark: iconHF, iconActive: iconHF },
  { key: "twitter", label: "X", description: "账号时间线和圈层信号", iconLight: iconXBlack, iconDark: iconX, iconActive: iconX },
  { key: "arxiv", label: "arXiv", description: "新论文抓取与筛选", iconLight: iconArxiv, iconDark: iconArxiv, iconActive: iconArxiv },
] satisfies Array<{ key: SourceName; label: string; description: string; iconLight: string; iconDark: string; iconActive: string }>;

export default function AppShell() {
  const desktopWindow = isTauriDesktop();
  const forcedTab = readTabFromLocation();
  const panelWindowMode = desktopWindow && forcedTab !== null;
  const showCustomTitleBar = !desktopWindow;
  const socketRef = useRef<WebSocket | null>(null);
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(() => readPreference("ideer.language", "system"));
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readPreference("ideer.theme", "system"));
  const [activeView, setActiveView] = useState<ViewName>("home");
  const [controlPanel, setControlPanel] = useState<ControlPanel>("none");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [userProfile, setUserProfile] = useState<UserProfile>(() => normalizeUserProfile(readJsonPreference("ideer.user", DEFAULT_PROFILE)));
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [startingBackend, setStartingBackend] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [aboutInfo, setAboutInfo] = useState<AboutInfo>(DEFAULT_ABOUT_INFO);
  const [config, setConfig] = useState<ConfigData>(DEFAULT_CONFIG);
  const [runForm, setRunForm] = useState<RunRequest>(DEFAULT_RUN_FORM);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedResult, setSelectedResult] = useState<ResultSet | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [runFiles, setRunFiles] = useState<string[]>([]);
  const [runState, setRunState] = useState<RunState>("idle");
  const [statusText, setStatusText] = useState("等待连接服务");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ kind: "idle" | "success" | "error"; message: string }>({ kind: "idle", message: "" });
  const [errorText, setErrorText] = useState("");
  const language = resolveLanguage(languagePreference);
  const theme = resolveTheme(themePreference);
  const copy = COPY[language];

  useEffect(() => {
    void initialize();
    const timer = window.setInterval(() => void refreshHealth(), 5000);
    return () => {
      window.clearInterval(timer);
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ideer.language", languagePreference);
  }, [languagePreference]);

  useEffect(() => {
    window.localStorage.setItem("ideer.theme", themePreference);
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    setConnectionTestResult({ kind: "idle", message: "" });
  }, [config.provider, config.model, config.base_url, config.api_key]);

  useEffect(() => {
    if (themePreference !== "system") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      document.documentElement.dataset.theme = resolveTheme("system");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themePreference]);

  async function initialize() {
    void loadAboutData();
    if (await refreshHealth()) {
      await hydrate();
    } else {
      setLoadingData(false);
      setStatusText(isTauriDesktop() ? copy.statusWaitingDesktop : copy.statusWaitingWeb);
    }
  }

  async function refreshHealth() {
    try {
      await checkHealth();
      setBackendHealthy(true);
      return true;
    } catch {
      setBackendHealthy(false);
      return false;
    }
  }

  async function loadAboutData() {
    try {
      const data = await getAboutInfo();
      setAboutInfo(data);
    } catch {
      setAboutInfo(DEFAULT_ABOUT_INFO);
    }
  }

  async function hydrate() {
    try {
      setLoadingData(true);
      const [metaData, configData, historyData] = await Promise.all([getPublicMeta(), getConfig(), getHistory()]);
      setMeta(metaData);
      setConfig(configData);
      setRunForm((prev) => ({ ...prev, receiver: configData.receiver, description: configData.description, researcher_profile: configData.researcher_profile }));
      setUserProfile((prev) => normalizeUserProfile({
        ...prev,
        receiver: prev.receiver || configData.receiver,
        focus: prev.focus || configData.description,
      }));
      setHistory(historyData);
      setStatusText(copy.statusConnected);
      setErrorText("");
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setLoadingData(false);
    }
  }

  async function handleStartBackend() {
    try {
      setStartingBackend(true);
      await startManagedBackend();
      for (let i = 0; i < 12; i += 1) {
        if (await refreshHealth()) {
          await hydrate();
          setStatusText(copy.statusBackendStarted);
          return;
        }
        await delay(1000);
      }
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setStartingBackend(false);
    }
  }

  async function handleStopBackend() {
    await stopManagedBackend();
    setBackendHealthy(false);
    setStatusText(copy.statusBackendStopped);
  }

  async function refreshHistoryList() {
    if (!backendHealthy) return;
    try {
      setHistoryLoading(true);
      setHistory(await getHistory());
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openHistory(entry: HistoryEntry) {
    if (!backendHealthy) return;
    setSelectedResult(await getResults(entry.type, entry.date));
    setActiveView("library");
  }

  async function persistConfig() {
    if (!backendHealthy) return;
    try {
      setSavingConfig(true);
      await saveConfig(config);
      setStatusText(copy.statusConfigSaved);
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setSavingConfig(false);
    }
  }

  async function persistUserProfile() {
    const nextProfile = {
      ...normalizeUserProfile(userProfile),
      receiver: userProfile.receiver.trim(),
      focus: userProfile.focus.trim(),
      name: userProfile.name.trim(),
    };
    const nextConfig = {
      ...config,
      receiver: nextProfile.receiver,
      description: nextProfile.focus,
    };
    try {
      setSavingProfile(true);
      setUserProfile(nextProfile);
      setConfig(nextConfig);
      window.localStorage.setItem("ideer.user", JSON.stringify(nextProfile));
      if (backendHealthy) {
        await saveConfig(nextConfig);
      }
      setStatusText(copy.settings.profileSaved);
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTestingConnection(true);
      const result = await testOpenAICompatibleApi({
        baseUrl: config.base_url,
        apiKey: config.api_key,
        model: config.model,
      });
      setConnectionTestResult({ kind: "success", message: result.message });
    } catch (error) {
      setConnectionTestResult({ kind: "error", message: getErrorMessage(error) });
    } finally {
      setTestingConnection(false);
    }
  }

  async function openControlPanel(tab: SettingsTab = "profile") {
    if (panelWindowMode) {
      return;
    }
    if (isTauriDesktop()) {
      try {
        await openControlPanelWindow(tab);
      } catch (error) {
        setErrorText(getErrorMessage(error));
      }
      return;
    }
    setSettingsTab(tab);
    setControlPanel("settings");
  }

  function runWorkflow() {
    if (!backendHealthy) return;
    socketRef.current?.close();
    setLogs([]);
    setRunFiles([]);
    setRunState("running");
    socketRef.current = openRunSocket(runForm, {
      onMessage(message) {
        if (message.type === "complete") {
          const done = message as RunCompleteMessage;
          setRunFiles(done.files);
          setRunState(done.success ? "done" : "error");
          setStatusText(done.success ? copy.statusRunDone(done.date) : copy.statusRunExited);
          void refreshHistoryList();
          return;
        }
        setLogs((prev) => [...prev, (message as RunMessage & { message: string }).message]);
        if (message.type === "error") setRunState("error");
      },
      onError() {
        setRunState("error");
        setStatusText(copy.statusSocketError);
      },
      onClose() {
        socketRef.current = null;
      },
    });
  }

  const sources = useMemo(() => SOURCES.map((item) => {
    const selected = runForm.sources.includes(item.key);
    return {
      ...item,
      description: copy.sourceDescriptions[item.key],
      selected,
      icon: selected ? item.iconActive : theme === "dark" ? item.iconDark : item.iconLight,
    };
  }), [copy, runForm.sources, theme]);
  const avatarMap = useMemo(() => Object.fromEntries(AVATARS.map((item) => [item.key, item.src])) as Record<AvatarId, string>, []);
  const sidebarName = userProfile.name || copy.user.fallbackName;
  const sidebarFocus = userProfile.focus || copy.user.fallbackFocus;
  const commonProps = { backendHealthy, loadingData, errorText, statusText, copy };

  if (panelWindowMode && forcedTab) {
    return (
      <div className="desktop-root panel-window-mode native-frame">
        <ControlCenter
          detached
          panel="settings"
          initialTab={forcedTab}
          onClose={() => void closeWindow()}
          userProfile={userProfile}
          avatars={AVATARS}
          backendHealthy={backendHealthy}
          startingBackend={startingBackend}
          statusText={statusText}
          config={config}
          savingConfig={savingConfig}
          savingProfile={savingProfile}
          onChangeConfig={setConfig}
          onChangeUserProfile={setUserProfile}
          onSave={persistConfig}
          onTestConnection={handleTestConnection}
          onSaveProfile={persistUserProfile}
          onStartBackend={handleStartBackend}
          onStopBackend={handleStopBackend}
          onRefresh={hydrate}
          copy={copy}
          appIcon={iconIDeer}
          githubUrl={aboutInfo.github_url || meta?.github_url || DEFAULT_ABOUT_INFO.github_url}
          contributors={aboutInfo.contributors}
          testingConnection={testingConnection}
          connectionTestResult={connectionTestResult}
          languagePreference={languagePreference}
          themePreference={themePreference}
          onChangeLanguage={setLanguagePreference}
          onChangeTheme={setThemePreference}
        />
      </div>
    );
  }

  return (
    <div className={showCustomTitleBar ? "desktop-root" : "desktop-root native-frame"}>
      {showCustomTitleBar ? <TitleBar backendHealthy={backendHealthy} statusText={statusText} previewBadge={copy.previewBadge} title={copy.desktopTitle} /> : null}
      <div className="desktop-shell">
        <aside className="app-sidebar">
          <div className="brand-block text-only"><div><h1>{copy.appTitle}</h1><p className="brand-subtitle">{copy.desktopTitle}</p></div></div>
          <nav className="nav-stack">
            <SidebarButton icon={faHouse} label={copy.sidebar.home} active={activeView === "home"} onClick={() => setActiveView("home")} />
            <SidebarButton icon={faFolderOpen} label={copy.sidebar.library} active={activeView === "library"} onClick={() => setActiveView("library")} />
          </nav>
          <div className="sidebar-footer">
            <div className="user-dock">
              <div className="user-card">
                <img src={avatarMap[userProfile.avatar]} alt={sidebarName} className="user-avatar" />
                <span className="user-meta">
                  <strong>{sidebarName}</strong>
                  <span>{sidebarFocus}</span>
                </span>
              </div>
              <button title={copy.home.openSettings} className="menu-button" onClick={() => openControlPanel("profile")}><FontAwesomeIcon icon={faBars} /></button>
            </div>
          </div>
        </aside>

        <main className="workspace">
          {activeView === "home" && <HomeView {...commonProps} config={config} recentHistory={history.slice(0, 5)} sources={sources} startingBackend={startingBackend} runForm={runForm} runState={runState} logs={logs} runFiles={runFiles} historyLoading={historyLoading} onOpenSettings={() => openControlPanel("profile")} onRefresh={hydrate} onRun={runWorkflow} onRefreshHistory={refreshHistoryList} onStartBackend={handleStartBackend} onStopBackend={handleStopBackend} onOpenHistory={openHistory} onToggleSource={(source) => setRunForm((prev) => ({ ...prev, sources: prev.sources.includes(source) ? prev.sources.filter((item) => item !== source) : [...prev.sources, source] }))} onChangeRunForm={(key, value) => setRunForm((prev) => ({ ...prev, [key]: value }))} />}
          {activeView === "library" && <LibraryView backendHealthy={backendHealthy} history={history} selectedResult={selectedResult} historyLoading={historyLoading} onRefresh={refreshHistoryList} onSelect={openHistory} copy={copy} />}
        </main>

        <button
          className="floating-star-button"
          title={copy.info.github}
          onClick={() => openExternalUrl(aboutInfo.github_url || meta?.github_url || DEFAULT_ABOUT_INFO.github_url)}
        >
          <FontAwesomeIcon icon={faStar} />
          <span>Star</span>
        </button>

        {controlPanel === "settings" ? <ControlCenter
          panel="settings"
          initialTab={settingsTab}
          onClose={() => setControlPanel("none")}
          userProfile={userProfile}
          avatars={AVATARS}
          backendHealthy={backendHealthy}
          startingBackend={startingBackend}
          statusText={statusText}
          config={config}
          savingConfig={savingConfig}
          savingProfile={savingProfile}
          onChangeConfig={setConfig}
          onChangeUserProfile={setUserProfile}
          onSave={persistConfig}
          onTestConnection={handleTestConnection}
          onSaveProfile={persistUserProfile}
          onStartBackend={handleStartBackend}
          onStopBackend={handleStopBackend}
          onRefresh={hydrate}
          copy={copy}
          appIcon={iconIDeer}
          githubUrl={aboutInfo.github_url || meta?.github_url || DEFAULT_ABOUT_INFO.github_url}
          contributors={aboutInfo.contributors}
          testingConnection={testingConnection}
          connectionTestResult={connectionTestResult}
          languagePreference={languagePreference}
          themePreference={themePreference}
          onChangeLanguage={setLanguagePreference}
          onChangeTheme={setThemePreference}
        /> : null}
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "发生未知错误";
}

function readPreference<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = window.localStorage.getItem(key) as T | null;
  return value ?? fallback;
}

function readJsonPreference<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = window.localStorage.getItem(key);
  if (!value) {
    return fallback;
  }
  try {
    return { ...fallback, ...JSON.parse(value) } as T;
  } catch {
    return fallback;
  }
}

function normalizeUserProfile(profile: UserProfile): UserProfile {
  const validAvatars = new Set<AvatarId>(["0", "1", "2", "3"]);
  return {
    ...profile,
    avatar: validAvatars.has(profile.avatar) ? profile.avatar : "2",
  };
}

function readTabFromLocation(): SettingsTab | null {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("window") !== "panel") {
    return null;
  }
  const tab = params.get("tab");
  if (tab === "profile" || tab === "preferences" || tab === "subscriptions" || tab === "mail" || tab === "info") {
    return tab;
  }
  return "profile";
}
