import { useState } from 'react'

type Order = 'original' | 'shuffle'

type Props = {
  ready: boolean
  onStart: (order: Order) => Promise<void>
}

/** Mode and order choice at the bottom of the review screen. */
export default function StartPractice({ ready, onStart }: Props) {
  const [order, setOrder] = useState<Order>('original')
  const [starting, setStarting] = useState(false)

  async function start() {
    setStarting(true)
    try {
      await onStart(order)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="start-practice">
      <fieldset className="choice-group">
        <legend>Mode</legend>
        <label>
          <input type="radio" name="mode" checked readOnly /> Practice
          <span className="muted"> · see the answer after each question</span>
        </label>
        <label className="muted">
          <input type="radio" name="mode" disabled /> Exam (coming soon)
        </label>
      </fieldset>
      <fieldset className="choice-group">
        <legend>Order</legend>
        <label>
          <input type="radio" name="order" checked={order === 'original'} onChange={() => setOrder('original')} /> Original order
        </label>
        <label>
          <input type="radio" name="order" checked={order === 'shuffle'} onChange={() => setOrder('shuffle')} /> Shuffle
        </label>
      </fieldset>
      {!ready && <p className="muted">Fix or remove the flagged questions to start practising.</p>}
      <button type="button" className="primary wide" disabled={!ready || starting} onClick={() => void start()}>
        {starting ? 'Starting…' : 'Start practising'}
      </button>
    </div>
  )
}
