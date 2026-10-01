export function formatBalance(balance: bigint): string {
  return `${new Intl.NumberFormat('en-US').format(balance)} 🩰`;
}
