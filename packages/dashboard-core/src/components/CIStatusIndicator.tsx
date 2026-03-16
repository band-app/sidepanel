import { Tooltip, TooltipContent, TooltipTrigger } from "@band/ui";
import { Ban, CircleAlert, CircleCheck, GitMerge, Loader } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import type { CIStatus } from "../types";

interface Props {
  ci: CIStatus;
}

/**
 * Wraps an icon in an `<a>` tag when a URL is present so that clicking the
 * CI badge opens the PR / workflow-run in a new browser tab.  Using a native
 * anchor element instead of a programmatic `window.open` call is more
 * reliable (avoids popup-blocker issues, works with Ctrl/Cmd-click and
 * right-click → "Open in new tab") and more accessible.
 *
 * `e.stopPropagation()` prevents the WorkspaceCard's onClick from also
 * firing, which would navigate to the workspace chat page.
 */
function CIIcon({
  Icon,
  ci,
  colorClass,
  extraClass,
  tooltip,
}: {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  ci: CIStatus;
  colorClass: string;
  extraClass?: string;
  tooltip: ReactNode;
}) {
  const icon = <Icon className={`size-3.5 shrink-0 ${colorClass} ${extraClass ?? ""}`} />;

  if (ci.url) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={ci.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex cursor-pointer"
          >
            {icon}
          </a>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{icon}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function CIStatusIndicator({ ci }: Props) {
  if (ci.state === "merged") {
    return <CIIcon Icon={GitMerge} ci={ci} colorClass="text-violet-400" tooltip="Merged" />;
  }

  if (ci.state === "success") {
    return <CIIcon Icon={CircleCheck} ci={ci} colorClass="text-green-400" tooltip="CI passed" />;
  }

  if (ci.state === "failure") {
    return <CIIcon Icon={CircleAlert} ci={ci} colorClass="text-red-400" tooltip="CI failed" />;
  }

  if (ci.state === "running" || ci.state === "pending") {
    return (
      <CIIcon
        Icon={Loader}
        ci={ci}
        colorClass="text-yellow-400"
        extraClass="animate-spin"
        tooltip={ci.state === "running" ? "CI running" : "CI pending"}
      />
    );
  }

  if (ci.state === "cancelled") {
    return <CIIcon Icon={Ban} ci={ci} colorClass="text-gray-400" tooltip="CI cancelled" />;
  }

  return null;
}
