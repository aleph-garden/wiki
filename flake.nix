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

        # JSS via bunx — npm package may be ahead of nixpkgs for v0.0.200+.
        # Data lives under $XDG_DATA_HOME/aleph-wiki/pod (or ~/.local/share fallback).
        jssRunner = pkgs.writeShellScriptBin "aleph-jss" ''
          set -e
          DATA_DIR="''${XDG_DATA_HOME:-$HOME/.local/share}/aleph-wiki/pod"
          mkdir -p "$DATA_DIR"
          echo "[aleph-jss] data=$DATA_DIR port=3000"
          exec ${pkgs.bun}/bin/bunx --bun javascript-solid-server@latest \
            start --mcp --port 3000 --data "$DATA_DIR" --single-user
        '';

        seedRunner = pkgs.writeShellScriptBin "aleph-seed" ''
          set -e
          cd ${self}
          exec ${pkgs.bun}/bin/bun run scripts/seed-pod.ts
        '';

        chatLauncher = pkgs.writeShellScriptBin "aleph-chat" ''
          set -e
          cd ${self}
          if ! command -v claude >/dev/null 2>&1; then
            echo "claude CLI not in PATH. Install Claude Code first."
            exit 1
          fi
          echo "starting claude with aleph-pod MCP server"
          echo "initial prompt: prompts/agent-loop.md"
          exec claude --append-system-prompt "$(cat prompts/agent-loop.md)"
        '';

        devApp = pkgs.writeShellScriptBin "aleph-dev" ''
          set -e
          cd ${self}
          export PATH="${pkgs.lib.makeBinPath [ pkgs.bun jssRunner seedRunner ]}:$PATH"
          exec ${pkgs.process-compose}/bin/process-compose \
            -f ${self}/process-compose.yaml
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
