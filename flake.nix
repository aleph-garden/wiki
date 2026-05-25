{
  description = "aleph.wiki — semantic-web knowledge garden UI";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            nodejs_22
          ];
          shellHook = ''
            echo "aleph.wiki devshell — bun $(bun --version), node $(node --version)"
            echo "  bun install   # install deps"
            echo "  bun dev       # start vite"
            echo "  bun run build # production build"
          '';
        };
      });
}
