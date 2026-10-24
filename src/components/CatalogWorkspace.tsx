import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export function CatalogWorkspace({
  className,
  style,
  title,
  back,
  sidebar,
  children,
}: {
  className: string;
  style?: CSSProperties;
  title: string;
  back: string;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(
    () => !window.matchMedia('(max-width: 900px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setExpanded(!media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return (
    <main className={`page catalog-workspace ${className}`} style={style}>
      <aside className="catalog-sidebar">
        <Link className="back-link" to={back}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('Back')}
        </Link>
        <details
          className="catalog-sidebar-disclosure"
          open={expanded}
          onToggle={(event) => setExpanded(event.currentTarget.open)}
        >
          <summary>
            <span>{title}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="catalog-sidebar-body">{sidebar}</div>
        </details>
      </aside>
      <section className="catalog-content">{children}</section>
    </main>
  );
}
