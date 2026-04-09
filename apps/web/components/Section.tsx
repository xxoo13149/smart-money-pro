export const Section = ({
  title,
  description,
  children,
  action
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <section className="section-card">
    <div className="section-head">
      <div>
        <h2 className="section-card__title">{title}</h2>
        {description ? <p className="section-card__description">{description}</p> : null}
      </div>
      {action}
    </div>
    <div>{children}</div>
  </section>
);
