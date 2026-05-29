{
  description = "aleph.wiki — semantic-web knowledge garden UI";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # All scripts run from the user's project directory (not the nix-store
        # snapshot ${self}, which has no node_modules). Override via
        # ALEPH_PROJECT_DIR if invoking outside the repo.
        projectDirSnippet = ''
          PROJECT_DIR="''${ALEPH_PROJECT_DIR:-$PWD}"
          if [ ! -f "$PROJECT_DIR/package.json" ]; then
            echo "aleph: $PROJECT_DIR has no package.json — set ALEPH_PROJECT_DIR" >&2
            exit 1
          fi
          if [ ! -d "$PROJECT_DIR/node_modules" ]; then
            echo "aleph: $PROJECT_DIR/node_modules missing — running bun install"
            (cd "$PROJECT_DIR" && ${pkgs.bun}/bin/bun install)
          fi
          cd "$PROJECT_DIR"
        '';

        # JSS via bunx — npm package may be ahead of nixpkgs for v0.0.200+.
        # Data lives under $XDG_DATA_HOME/aleph-wiki/pod (or ~/.local/share fallback).
        jssRunner = pkgs.writeShellScriptBin "aleph-jss" ''
          set -e
          DATA_DIR="''${XDG_DATA_HOME:-$HOME/.local/share}/aleph-wiki/pod"
          mkdir -p "$DATA_DIR"
          echo "[aleph-jss] data=$DATA_DIR port=3000"
          exec ${pkgs.bun}/bin/bunx --bun javascript-solid-server@latest \
            start --mcp --notifications --conneg --port 3000 --root "$DATA_DIR" \
            --single-user --single-user-password aleph.wiki --public
        '';

        seedRunner = pkgs.writeShellScriptBin "aleph-seed" ''
          set -e
          ${projectDirSnippet}
          exec ${pkgs.bun}/bin/bun run scripts/seed-pod.ts
        '';

        chatLauncher = pkgs.writeShellScriptBin "aleph-chat" ''
          set -e
          ${projectDirSnippet}
          if ! command -v claude >/dev/null 2>&1; then
            echo "claude CLI not in PATH. Install Claude Code first."
            exit 1
          fi
          echo "starting claude with aleph-pod MCP server"
          echo "initial prompt: prompts/agent-loop.md"
          # Pass loop instructions as the FIRST user message so Claude starts
          # immediately. Without an initial user turn it would just sit idle.
          exec claude "$(cat prompts/agent-loop.md)"
        '';

        devApp = pkgs.writeShellScriptBin "aleph-dev" ''
          set -e
          ${projectDirSnippet}
          export PATH="${pkgs.lib.makeBinPath [ pkgs.bun pkgs.nodejs_22 jssRunner seedRunner ]}:$PATH"
          # Default API port 8080 collides with common dev services — pin to 8085.
          PC_PORT="''${ALEPH_PC_PORT:-8085}"
          exec ${pkgs.process-compose}/bin/process-compose \
            -p "$PC_PORT" \
            -f "$PROJECT_DIR/process-compose.yaml"
        '';
      in {
        apps = {
          dev  = { type = "app"; program = "${devApp}/bin/aleph-dev"; };
          chat = { type = "app"; program = "${chatLauncher}/bin/aleph-chat"; };
          seed = { type = "app"; program = "${seedRunner}/bin/aleph-seed"; };
          default = self.apps.${system}.dev;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            nodejs_22
            process-compose
            jssRunner
            seedRunner
          ];
          shellHook = ''
            echo "aleph.wiki devshell — bun $(bun --version), node $(node --version)"
            echo "  nix run .#dev    # vite + jss + seed via process-compose"
            echo "  nix run .#chat   # claude with aleph-pod MCP server"
            echo "  nix run .#seed   # seed pod from data/demo-game-theory.ttl"
          '';
        };
      });
}
