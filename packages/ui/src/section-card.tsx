import React from "react";

export function SectionCard(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="section-card">
      <h3 className="section-card-header">{props.title}</h3>
      <div className="section-card-body">{props.children}</div>
    </section>
  );
}
