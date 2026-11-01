'use client';
import {
  createContext,
  useContext,
  useLayoutEffect,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
export const PageTitleContext = createContext<Dispatch<
  SetStateAction<ReactNode>
> | null>(null);
/** Registers the page's title with workspace chrome; standalone screens retain their heading. */
export function PageTitle({ children }: { children: ReactNode }) {
  const setTitle = useContext(PageTitleContext);
  useLayoutEffect(() => {
    if (!setTitle) return;
    setTitle(children);
    return () => setTitle(null);
  }, [children, setTitle]);
  return setTitle ? null : <h1>{children}</h1>;
}
