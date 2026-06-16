if [ -e ~/.nix-profile/etc/profile.d/nix.sh ]; then
  source ~/.nix-profile/etc/profile.d/nix.sh
fi
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"

# Added by Windsurf
export PATH="/Users/gatskovsergey/.codeium/windsurf/bin:$PATH"

. "$HOME/.local/bin/env"
