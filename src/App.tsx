import "./styles/index.css";
import { useEffect, useState } from "react";
import { ArrowRight, Boxes, Clock3, House, Plus, Route, Trash2, X } from "lucide-react";
import { DirectorDeskShell } from "./app/layout/DirectorDeskShell";
import { DirectorCanvas } from "./editor/canvas/DirectorCanvas";
import { ViewportSensitivitySettings } from "./editor/canvas/ViewportSensitivitySettings";
import {
  DIRECTOR_DESK_SESSION_OPENED_EVENT,
  getDirectorDeskHostOrigin,
  initDirectorDeskHostBridge,
} from "./editor/io/hostBridge";
import { useDirectorStore } from "./editor/store/directorStore";
import {
  createDirectorDeskRecord,
  deleteDirectorDeskRecord,
  ensureDirectorDeskRecordForId,
  ensureDirectorDeskRecords,
  getInitialDirectorDeskId,
  touchDirectorDeskRecord,
  writeActiveDirectorDeskId,
  writeDirectorDeskRecords,
  type DirectorDeskRecord,
} from "./editor/workspaces/directorDeskRegistry";

type AppScreen = "home" | "editor";

function getUrlDirectorDeskInstanceId() {
  try {
    return new URLSearchParams(window.location.search).get("instanceId")?.trim() || null;
  } catch {
    return null;
  }
}

function updateUrlDirectorDeskInstanceId(id: string | null) {
  try {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("instanceId", id);
    } else {
      url.searchParams.delete("instanceId");
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Navigation state remains usable even if the embedding host blocks History API writes.
  }
}

function createInitialDirectorDeskViewState() {
  const records = ensureDirectorDeskRecords();
  const urlInstanceId = getUrlDirectorDeskInstanceId();
  return {
    records,
    activeDeskId: urlInstanceId ?? getInitialDirectorDeskId(records) ?? records[0]?.id ?? "",
    screen: urlInstanceId ? "editor" : ("home" as AppScreen),
  };
}

function formatDirectorDeskUpdatedAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "刚刚更新";

  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return "刚刚更新";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)} 小时前`;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function App() {
  const viewMode = useDirectorStore((state) => state.viewMode);
  const setViewMode = useDirectorStore((state) => state.setViewMode);
  const motionStudioOpen = useDirectorStore((state) => state.motionStudioOpen);
  const setMotionStudioOpen = useDirectorStore((state) => state.setMotionStudioOpen);
  const [directorDeskView, setDirectorDeskView] = useState(createInitialDirectorDeskViewState);
  const { records: directorDesks, activeDeskId, screen } = directorDeskView;

  function openDirectorDesk(
    id: string,
    records = directorDesks,
    options: { loadScene?: boolean } = {}
  ) {
    if (!id) return;

    const { loadScene = true } = options;
    const ensured = ensureDirectorDeskRecordForId(records, id);
    const nextRecords = touchDirectorDeskRecord(ensured.records, id);
    setDirectorDeskView({ records: nextRecords, activeDeskId: id, screen: "editor" });
    writeActiveDirectorDeskId(id);
    updateUrlDirectorDeskInstanceId(id);
    if (loadScene) {
      useDirectorStore.getState().openScopedScene(id);
    }
  }

  function backToHome() {
    const records = ensureDirectorDeskRecords();
    setDirectorDeskView({ records, activeDeskId, screen: "home" });
    updateUrlDirectorDeskInstanceId(null);
  }

  useEffect(() => {
    initDirectorDeskHostBridge();
    if (screen === "editor") {
      openDirectorDesk(activeDeskId, directorDesks);
    }

    window.parent?.postMessage({ type: "storyai:director-desk-ready" }, getDirectorDeskHostOrigin());
  }, []);

  useEffect(() => {
    function handleHostSessionOpened(event: Event) {
      const instanceId = (event as CustomEvent<{ instanceId?: string }>).detail?.instanceId;
      if (instanceId) {
        openDirectorDesk(instanceId, directorDesks, { loadScene: false });
      }
    }

    window.addEventListener(DIRECTOR_DESK_SESSION_OPENED_EVENT, handleHostSessionOpened);
    return () => window.removeEventListener(DIRECTOR_DESK_SESSION_OPENED_EVENT, handleHostSessionOpened);
  }, [directorDesks]);

  function handleCreateDesk() {
    const record = createDirectorDeskRecord(directorDesks);
    const nextRecords = [...directorDesks, record];
    writeDirectorDeskRecords(nextRecords);
    openDirectorDesk(record.id, nextRecords);
  }

  function handleDeleteDesk(desk: DirectorDeskRecord) {
    if (!window.confirm(`删除「${desk.name}」？这个导演台里的本地场景也会一起删除。`)) return;

    const result = deleteDirectorDeskRecord(directorDesks, desk.id);
    setDirectorDeskView({
      records: result.records,
      activeDeskId: result.activeId ?? result.records[0]?.id ?? "",
      screen: "home",
    });
  }

  function handleClose() {
    window.parent?.postMessage({ type: "storyai:director-desk-close" }, getDirectorDeskHostOrigin());
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;
      if (!event.metaKey && !event.ctrlKey) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        useDirectorStore.getState().copySelectedObjects();
        return;
      }

      if (key === "v") {
        event.preventDefault();
        useDirectorStore.getState().pasteClipboardObjects();
        return;
      }

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        useDirectorStore.getState().undo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (screen === "home") {
    return (
      <main className="director-home-shell">
        <section className="director-home-hero">
          <div>
            <p className="director-home-kicker">Standalone 3D Director Desk</p>
            <h1>选择一个导演台开始摆场景</h1>
            <p>
              每个导演台独立保存，重启后先回到这里选择，不会再直接打开上一次的无名工程。
            </p>
          </div>
          <button className="director-home-primary-button" type="button" onClick={handleCreateDesk}>
            <Plus aria-hidden="true" size={18} />
            新建导演台
          </button>
        </section>

        {directorDesks.length ? (
          <section className="director-home-grid" aria-label="导演台列表">
            {directorDesks.map((desk, index) => (
              <article
                key={desk.id}
                className={`director-home-card ${desk.id === activeDeskId ? "is-active" : ""}`}
              >
                <button className="director-home-card-main" type="button" onClick={() => openDirectorDesk(desk.id)}>
                  <span className="director-home-card-icon">
                    <Boxes aria-hidden="true" size={22} strokeWidth={1.8} />
                  </span>
                  <span className="director-home-card-content">
                    <span className="director-home-card-title">{desk.name}</span>
                    <span className="director-home-card-meta">
                      <Clock3 aria-hidden="true" size={13} />
                      {formatDirectorDeskUpdatedAt(desk.updatedAt)}
                    </span>
                  </span>
                  <span className="director-home-card-index">{String(index + 1).padStart(2, "0")}</span>
                  <ArrowRight className="director-home-card-arrow" aria-hidden="true" size={18} />
                </button>
                <button
                  className="director-home-card-delete"
                  type="button"
                  aria-label={`删除${desk.name}`}
                  onClick={() => handleDeleteDesk(desk)}
                >
                  <Trash2 aria-hidden="true" size={15} strokeWidth={1.9} />
                </button>
              </article>
            ))}
          </section>
        ) : (
          <section className="director-home-empty" aria-label="空导演台列表">
            <Boxes aria-hidden="true" size={28} strokeWidth={1.6} />
            <h2>还没有导演台</h2>
            <p>点击“新建导演台”创建一个干净的 3D 场景。</p>
          </section>
        )}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-left">
          <button className="top-bar-title top-bar-home-button" type="button" onClick={backToHome}>
            3D导演台
          </button>
          <button className="top-bar-home-nav-button" type="button" aria-label="返回首页" onClick={backToHome}>
            <House aria-hidden="true" size={14} strokeWidth={1.9} />
            首页
          </button>
          <div className="director-desk-switcher" aria-label="导演台选择器">
            <select
              className="director-desk-select"
              aria-label="选择导演台"
              value={activeDeskId}
              onChange={(event) => openDirectorDesk(event.currentTarget.value)}
            >
              {directorDesks.map((desk) => (
                <option key={desk.id} value={desk.id}>
                  {desk.name}
                </option>
              ))}
            </select>
            <button className="director-desk-create-button" type="button" onClick={handleCreateDesk}>
              <Plus aria-hidden="true" size={14} strokeWidth={1.9} />
              新建
            </button>
          </div>
        </div>
        <div className="top-bar-center">
          <div className="mode-toggle ui-segmented" role="group" aria-label="视角切换">
            <button
              className={`mode-toggle-button ui-segmented-item ${viewMode === "director" ? "ui-segmented-item-active" : ""}`}
              aria-pressed={viewMode === "director"}
              type="button"
              onClick={() => setViewMode("director")}
            >
              导演视角
            </button>
            <button
              className={`mode-toggle-button ui-segmented-item ${viewMode === "camera" ? "ui-segmented-item-active" : ""}`}
              aria-label="第一视角"
              aria-pressed={viewMode === "camera"}
              title="查看摄影机最终画面"
              type="button"
              onClick={() => setViewMode("camera")}
            >
              第一视角
            </button>
          </div>
          <button
            className={`top-bar-motion-button${motionStudioOpen ? " is-active" : ""}`}
            type="button"
            aria-label={motionStudioOpen ? "关闭运镜工作台" : "打开运镜工作台"}
            aria-pressed={motionStudioOpen}
            onClick={() => {
              setViewMode("director");
              setMotionStudioOpen(!motionStudioOpen);
            }}
          >
            <Route aria-hidden="true" size={15} />
            运镜
          </button>
          <ViewportSensitivitySettings />
        </div>
        <div className="top-bar-actions">
          <button
            className="top-bar-action-button"
            type="button"
            aria-label="关闭"
            title="关闭"
            onClick={handleClose}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </div>
      </header>
      <DirectorDeskShell>
        <DirectorCanvas />
      </DirectorDeskShell>
    </div>
  );
}
