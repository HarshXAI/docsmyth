import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index}>
            {index > 0 && <span className="breadcrumbs__separator">/</span>}
            {item.href && !isLast ? (
              <Link to={item.href}>{item.label}</Link>
            ) : (
              <span className={isLast ? 'breadcrumbs__current' : ''}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
