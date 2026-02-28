import React from "react";

export function SectionCard(props: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: "1px solid #e4e4e7",
        borderRadius: 14,
        padding: 16,
        background: "#ffffff",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 12 }}>{props.title}</h3>
      {props.children}
    </section>
  );
}
