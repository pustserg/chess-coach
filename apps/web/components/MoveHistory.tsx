export default function MoveHistory({ history }: { history: string[] }) {
  const rows: string[] = []
  for (let i = 0; i < history.length; i += 2) {
    const num = `${i / 2 + 1}.`
    const white = history[i]
    const black = history[i + 1]
    rows.push(black ? `${num} ${white} ${black}` : `${num} ${white}`)
  }
  return (
    <ol className="max-h-48 overflow-auto font-mono text-sm">
      {rows.map((r) => <li key={r}>{r}</li>)}
    </ol>
  )
}
