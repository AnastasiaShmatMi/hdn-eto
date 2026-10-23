type Props = {
  heading?: boolean;
  size?: 'md' | 'lg' | 'xl';
};

export function Brand({ heading = true, size = 'md' }: Props) {
  const text = 'ХДН-это';
  const Tag = heading ? 'h1' : 'p';
  return (
    <Tag className={`brand brand-${size}`}>
      <span className="brand-shift brand-pink" aria-hidden="true">{text}</span>
      <span className="brand-shift brand-blue" aria-hidden="true">{text}</span>
      <span className="brand-main">{text}</span>
    </Tag>
  );
}
