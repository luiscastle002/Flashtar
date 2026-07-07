"use client";

import { Github, Mail } from "lucide-react";
import { toast } from "sonner";

function DiscordIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 127.14 96.36"
      fill="currentColor"
      {...props}
    >
      <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c.9-.65,1.76-1.34,2.58-2.06a75.48,75.48,0,0,0,72.69,0c.82.72,1.68,1.4,2.58,2.06a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.07,54.65,123.55,31.58,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
    </svg>
  );
}

export function FooterSocials() {
  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText("support@flashtar.app");
      toast.success("Support email copied to clipboard");
    } catch {
      toast.error("Failed to copy email address");
    }
  };

  return (
    <div className="flex gap-4 items-center animate-in fade-in duration-300">
      <a
        href="https://discord.gg/FWG6bF6BaU"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        aria-label="Join our Discord community"
      >
        <DiscordIcon className="h-4 w-4" />
      </a>
      <a
        href="https://github.com/luiscastle002/Flashtar"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        aria-label="View Flashtar on GitHub"
      >
        <Github className="h-4 w-4" />
      </a>
      <button
        onClick={handleCopyEmail}
        className="hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm cursor-pointer"
        aria-label="Copy support email address"
      >
        <Mail className="h-4 w-4" />
      </button>
    </div>
  );
}
