{
  description = "Bootstrap shell for building a React web component";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];

      forAllSystems = f:
        nixpkgs.lib.genAttrs systems (system:
          let
            pkgs = import nixpkgs { inherit system; };
          in
          f pkgs
        );
    in
    {
      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            git
            jq
            nodejs_22
            pnpm
          ];

          shellHook = ''
            export npm_config_fund=false
            export npm_config_audit=false

            if [ ! -f package.json ]; then
              printf '%s\n' \
                'React component workspace is ready.' \
                "" \
                'Suggested bootstrap:' \
                '  pnpm create vite . --template react-ts' \
                '  pnpm install' \
                '  pnpm dev'
            fi
          '';
        };
      });
    };
}
