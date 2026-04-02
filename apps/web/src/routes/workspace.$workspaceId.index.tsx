import { AgentIcon } from "@band-app/dashboard-core";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChatView } from "../components/ChatView";
import { useIsDesktop } from "../hooks/useIsDesktop";
import { useSessionListContext } from "../hooks/useSessionListContext";
import { isTauri } from "../lib/is-tauri";
import { trpc } from "../lib/trpc-client";

export const Route = createFileRoute("/workspace/$workspaceId/")({
  component: WorkspaceIndex,
});

function WorkspaceIndex() {
  const { workspaceId } = Route.useParams();
  const decoded = decodeURIComponent(workspaceId);
  const isDesktop = useIsDesktop() && !isTauri;

  // Desktop: chat is always visible in the right panel — redirect to changes tab
  if (isDesktop) {
    return <Navigate to="/workspace/$workspaceId/changes" params={{ workspaceId }} replace />;
  }

  // Mobile: show chat view
  return <MobileChatContent workspaceId={decoded} />;
}

interface CodingAgentDef {
  id: string;
  type: string;
  label: string;
}

function MobileChatContent({ workspaceId }: { workspaceId: string }) {
  const [supportsSessionListing, setSupportsSessionListing] = useState(false);
  const [initialSessionId, setInitialSessionId] = useState<string | undefined>(undefined);
  const { showSessionList, setShowSessionList } = useSessionListContext();
  const [agents, setAgents] = useState<CodingAgentDef[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState<string>("");
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [taskRunning, setTaskRunning] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    trpc.sessions.list
      .query({ workspaceId })
      .then((data) => {
        if (cancelled) return;
        if (data.supported) {
          setSupportsSessionListing(true);
          const latest = [...data.sessions].sort((a, b) => b.lastModified - a.lastModified)[0];
          if (latest) setInitialSessionId(latest.sessionId);
        }
      })
      .catch((err) => {
        console.error("[sessions] error:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Load available agents from settings and current workspace agent
  // biome-ignore lint/correctness/useExhaustiveDependencies: chatKey intentionally triggers reload after agent switch; currentAgentId excluded to avoid infinite loop
  useEffect(() => {
    let cancelled = false;

    trpc.settings.get.query().then((settings) => {
      if (cancelled) return;
      const raw = (settings as Record<string, unknown>).codingAgents;
      const codingAgents = Array.isArray(raw) ? (raw as CodingAgentDef[]) : [];
      if (codingAgents.length > 0) {
        const seen = new Set<string>();
        const unique = codingAgents.filter((a) => {
          if (seen.has(a.type)) return false;
          seen.add(a.type);
          return true;
        });
        setAgents(unique);
      }
      const defaultAgent = (settings as Record<string, unknown>).defaultCodingAgent as
        | string
        | undefined;
      if (defaultAgent && !currentAgentId) {
        setCurrentAgentId(defaultAgent);
      }
    });

    trpc.statuses.get
      .query({ workspaceId })
      .then((status) => {
        if (cancelled) return;
        if (status?.agent?.codingAgentId) {
          setCurrentAgentId(status.agent.codingAgentId);
        }
      })
      .catch(() => {
        // Status might not exist yet
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, chatKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitchAgent = useCallback(
    async (agentId: string) => {
      setShowAgentMenu(false);
      if (agentId === currentAgentId) return;
      try {
        await trpc.workspace.switchAgent.mutate({ workspaceId, agentId });
        setCurrentAgentId(agentId);

        try {
          const data = await trpc.sessions.list.query({ workspaceId });
          if (data.supported && data.sessions.length > 0) {
            const latest = [...data.sessions].sort((a, b) => b.lastModified - a.lastModified)[0];
            setInitialSessionId(latest.sessionId);
            setSupportsSessionListing(true);
          } else {
            setInitialSessionId(undefined);
          }
        } catch {
          setInitialSessionId(undefined);
        }

        setChatKey((k) => k + 1);
      } catch (err) {
        console.error("[switchAgent] error:", err);
      }
    },
    [workspaceId, currentAgentId],
  );

  const currentAgent = agents.find((a) => a.id === currentAgentId);
  const switchDisabled = taskRunning;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {agents.length > 1 && (
        <div className="flex shrink-0 items-center justify-end border-b border-border px-3 py-1.5">
          <div className="relative">
            <button
              type="button"
              disabled={switchDisabled}
              onClick={() => setShowAgentMenu((prev) => !prev)}
              className={`inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors ${
                switchDisabled
                  ? "opacity-50 cursor-not-allowed text-muted-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {currentAgent && <AgentIcon type={currentAgent.type} className="size-3.5 shrink-0" />}
              <span className="max-w-[120px] truncate">{currentAgent?.label ?? "Default"}</span>
              <ChevronDown className="size-3 opacity-50" />
            </button>
            {showAgentMenu && !switchDisabled && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowAgentMenu(false)}
                  onKeyDown={() => {}}
                  role="presentation"
                />
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent ${
                        agent.id === currentAgentId
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => handleSwitchAgent(agent.id)}
                    >
                      <AgentIcon type={agent.type} className="size-3.5 shrink-0" />
                      {agent.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <ChatView
        key={chatKey}
        chatKey={chatKey}
        workspaceId={workspaceId}
        workspaceName={workspaceId}
        supportsSessionListing={supportsSessionListing}
        initialSessionId={initialSessionId}
        showSessionList={showSessionList}
        onShowSessionListChange={setShowSessionList}
        onStreamingChange={setTaskRunning}
      />
    </div>
  );
}
