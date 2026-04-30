/**
 * ASCII banner shown by setup wizard + first run hints.
 * Designed by Hiro · MIT License · FIS AI Team
 */

const RESET = '\x1b[0m'
const CYAN = '\x1b[36m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

const LOGO = `
${CYAN}${BOLD}███████╗██╗███████╗     █████╗ ██╗
██╔════╝██║██╔════╝    ██╔══██╗██║
█████╗  ██║███████╗    ███████║██║
██╔══╝  ██║╚════██║    ██╔══██║██║
██║     ██║███████║    ██║  ██║██║
╚═╝     ╚═╝╚══════╝    ╚═╝  ╚═╝╚═╝${RESET}

${BOLD}      FIS AI Team${RESET} ${DIM}— Hybrid SDLC Toolkit${RESET}
${DIM}      Designed by Hiro · MIT License${RESET}
`

export function printBanner(): void {
  // Only print on TTY — keep CI/script output clean
  if (process.stdout.isTTY) {
    console.log(LOGO)
  } else {
    // No-color fallback for non-TTY
    console.log('\n  FIS AI Team — Hybrid SDLC Toolkit')
    console.log('  Designed by Hiro · MIT License\n')
  }
}

export function printBannerCompact(): void {
  if (process.stdout.isTTY) {
    console.log(`${CYAN}${BOLD}fis-cli${RESET} ${DIM}— FIS AI Team · designed by Hiro${RESET}`)
  } else {
    console.log('fis-cli — FIS AI Team · designed by Hiro')
  }
}
