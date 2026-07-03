import type { AppLang } from "./i18n";
import type {
  AppData,
  ConnectionRecord,
  OAuthConfig,
  ProviderDefinition,
  RunLogPage,
  RuntimeTokenSummary,
} from "./model";
import type { FormEvent, ReactNode } from "react";

import { useI18n, useLang, useTranslate } from "@embra/i18n/react";
import { Activity, AppWindow, BookOpen, KeyRound, Loader2, RefreshCw, TerminalSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router";
import { AccessPage } from "./access-page";
import { ActionsPage } from "./actions-page";
import { ApiError, apiGet } from "./api";
import { persistLang, supportedLangs } from "./i18n";
import { emptyData } from "./model";
import { OverviewPage } from "./overview-page";
import { ProvidersPage } from "./providers-page";
import { ResourcesPage } from "./resources-page";
import { RunsPage } from "./runs-page";
import { InlineError, StatusDot } from "./shared-ui";

const navItems = [
  { path: "/overview", labelKey: "nav.overview", icon: Activity },
  { path: "/providers", labelKey: "nav.providers", icon: AppWindow },
  { path: "/actions", labelKey: "nav.actions", icon: TerminalSquare },
  { path: "/runs", labelKey: "nav.runs", icon: Activity },
  { path: "/access", labelKey: "nav.access", icon: KeyRound },
  { path: "/resources", labelKey: "nav.docs", icon: BookOpen },
] as const;

export function App(): ReactNode {
  const t = useTranslate();
  const [data, setData] = useState<AppData>(emptyData);
  const [adminToken, setAdminToken] = useState("");
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runtimeChecked, setRuntimeChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiGet<ProviderDefinition[]>("/api/providers", { adminToken }),
      apiGet<ConnectionRecord[]>("/api/connections", { adminToken }),
      apiGet<OAuthConfig[]>("/api/oauth/configs", { adminToken }),
      apiGet<RuntimeTokenSummary[]>("/api/runtime-tokens", { adminToken }),
      apiGet<RunLogPage>("/api/runs", { adminToken }),
    ])
      .then(([providers, connections, oauthConfigs, runtimeTokens, runPage]) => {
        if (!cancelled) {
          setData({
            providers,
            connections,
            oauthConfigs,
            runtimeTokens,
            runs: runPage.items,
            runsNextCursor: runPage.nextCursor,
          });
          setLocked(false);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        if (caught instanceof ApiError && caught.status === 401) {
          setData(emptyData);
          setLocked(true);
          setError(adminToken.trim() ? t("shell.invalidAdminToken") : null);
          return;
        }
        setError(caught instanceof Error ? caught.message : t("shell.loadRuntimeFailed"));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRuntimeChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adminToken, refreshToken, t]);

  function refresh(): void {
    setRefreshToken((value) => value + 1);
  }

  function unlock(token: string): void {
    setAdminToken(token);
    setLocked(false);
    setError(null);
    refresh();
  }

  function clearClientToken(): void {
    setAdminToken("");
    refresh();
  }

  if (locked) {
    return <UnlockView loading={loading} message={error} onUnlock={unlock} />;
  }

  if (!runtimeChecked) {
    return <InitialLoadingView />;
  }

  return (
    <AppShell
      data={data}
      adminToken={adminToken}
      loading={loading}
      error={error}
      onRefresh={refresh}
      onClearClientToken={clearClientToken}
    />
  );
}

function InitialLoadingView(): ReactNode {
  const t = useTranslate();

  return (
    <main className="unlock-screen">
      <div className="loading-panel">
        <Loader2 className="spin" size={16} />
        {t("common.loadingRuntimeData")}
      </div>
    </main>
  );
}

function AppShell(props: {
  data: AppData;
  adminToken: string;
  loading: boolean;
  error: string | null;
  onRefresh(): void;
  onClearClientToken(): void;
}): ReactNode {
  const t = useTranslate();
  const location = useLocation();
  const actions = useMemo(() => props.data.providers.flatMap((provider) => provider.actions), [props.data.providers]);
  const heading = headingForPath(location.pathname);
  const section = location.pathname.split("/").filter(Boolean)[0];
  const isBrowserPage = section === "actions" || section === "providers";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">OC</div>
          <div>
            <div className="brand-name">OOMOL Connect</div>
            <div className="brand-subtitle">{t("brand.subtitle")}</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label={t("shell.primaryNav")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                to={item.path}
              >
                <Icon size={16} />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <LanguageSelect />
          <div className="runtime-status">
            <StatusDot ok={!props.error} />
            <span>{props.error ? t("common.apiUnavailable") : t("common.runtimeReady")}</span>
          </div>
          <div className="button-row tight">
            <button className="icon-button compact" onClick={props.onRefresh} aria-label={t("shell.refreshData")}>
              {props.loading ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
            </button>
            {props.adminToken ? (
              <button className="secondary-button compact" onClick={props.onClearClientToken}>
                {t("shell.clearTypedToken")}
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      <main className={isBrowserPage ? "main main-browser" : "main"}>
        <section className="page-header">
          <div>
            <h1>{t(`shell.headings.${heading}.title`)}</h1>
            <p>{t(`shell.headings.${heading}.subtitle`)}</p>
          </div>
          {props.loading ? (
            <div className="loading-panel page-loading">
              <Loader2 className="spin" size={16} />
              {t("common.loadingRuntimeData")}
            </div>
          ) : null}
        </section>

        {props.error ? <InlineError message={props.error} /> : null}

        <Routes>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage data={props.data} onRefresh={props.onRefresh} />} />
          <Route
            path="/providers"
            element={<ProvidersPage data={props.data} adminToken={props.adminToken} onRefresh={props.onRefresh} />}
          />
          <Route
            path="/providers/:service"
            element={<ProvidersPage data={props.data} adminToken={props.adminToken} onRefresh={props.onRefresh} />}
          />
          <Route
            path="/actions"
            element={<ActionsPage data={props.data} adminToken={props.adminToken} onRefresh={props.onRefresh} />}
          />
          <Route
            path="/actions/:actionId"
            element={<ActionsPage data={props.data} adminToken={props.adminToken} onRefresh={props.onRefresh} />}
          />
          <Route
            path="/runs"
            element={
              <RunsPage
                initialRuns={props.data.runs}
                nextCursor={props.data.runsNextCursor}
                adminToken={props.adminToken}
              />
            }
          />
          <Route
            path="/access"
            element={
              <AccessPage tokens={props.data.runtimeTokens} adminToken={props.adminToken} onRefresh={props.onRefresh} />
            }
          />
          <Route path="/resources" element={<ResourcesPage actions={actions} />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function UnlockView(props: { loading: boolean; message: string | null; onUnlock(token: string): void }): ReactNode {
  const t = useTranslate();
  const [token, setToken] = useState("");

  function submit(event: FormEvent): void {
    event.preventDefault();
    props.onUnlock(token.trim());
  }

  return (
    <main className="unlock-screen">
      <section className="unlock-panel">
        <div className="brand">
          <div className="brand-mark">OC</div>
          <div>
            <div className="brand-name">OOMOL Connect</div>
            <div className="brand-subtitle">{t("brand.adminAccess")}</div>
          </div>
        </div>
        <LanguageSelect />
        <form className="form-grid" onSubmit={submit}>
          <label className="field">
            <span>{t("unlock.adminToken")}</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          <button className="primary-button" type="submit" disabled={!token.trim() || props.loading}>
            {props.loading ? <Loader2 className="spin" size={16} /> : null}
            {t("unlock.unlockConsole")}
          </button>
        </form>
        {props.message ? <InlineError message={props.message} /> : null}
      </section>
    </main>
  );
}

function LanguageSelect(): ReactNode {
  const t = useTranslate();
  const i18n = useI18n();
  const lang = useLang() as AppLang;

  function switchLang(nextLang: AppLang): void {
    persistLang(nextLang);
    void i18n.switchLang(nextLang);
  }

  return (
    <label className="language-select">
      <span>{t("language.label")}</span>
      <select value={lang} onChange={(event) => switchLang(event.target.value as AppLang)}>
        {supportedLangs.map((item) => (
          <option key={item} value={item}>
            {t(`language.${item}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function headingForPath(pathname: string): string {
  const section = pathname.split("/").filter(Boolean)[0];
  if (section === "providers") {
    return "providers";
  }
  if (section === "actions") {
    return "actions";
  }
  if (section === "runs") {
    return "runs";
  }
  if (section === "access") {
    return "access";
  }
  if (section === "resources") {
    return "resources";
  }
  return "overview";
}
