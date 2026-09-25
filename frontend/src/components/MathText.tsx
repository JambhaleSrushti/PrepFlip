import 'katex/contrib/mhchem' // \ce{H2SO4} chemistry notation
import renderMathInElement from 'katex/contrib/auto-render'
import 'katex/dist/katex.min.css'
import { useLayoutEffect, useRef } from 'react'

const DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '$', right: '$', display: false },
  { left: '\\(', right: '\\)', display: false },
]

/** Text with $…$ LaTeX (maths, chemistry, symbols) rendered by KaTeX. Bad LaTeX is shown as typed. */
export default function MathText({ text, as: Tag = 'span', className }: { text: string; as?: 'span' | 'p' | 'div'; className?: string }) {
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = text
    if (text.includes('$') || text.includes('\\(')) {
      renderMathInElement(el, { delimiters: DELIMITERS, throwOnError: false })
    }
  }, [text])

  return <Tag ref={ref as never} className={className} />
}
