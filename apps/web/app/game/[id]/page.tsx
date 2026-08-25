'use client'

import { useParams } from 'next/navigation'
import OnlineGame from '../../../components/OnlineGame'

export default function GamePage() {
  const params = useParams<{ id: string }>()
  return <OnlineGame gameId={params.id} />
}
