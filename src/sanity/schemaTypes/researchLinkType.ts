import { defineField, defineType } from "sanity";

export const researchLinkType = defineType({
  name: "researchLink",
  title: "Research Link",
  type: "document",
  fields: [
    defineField({
      name: "case",
      title: "Caso",
      type: "reference",
      to: [{ type: "case" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "caseSlug",
      title: "Slug del caso",
      type: "string",
      description: "Denormalised for fast querying without join",
    }),
    defineField({
      name: "label",
      title: "Etiqueta",
      type: "string",
    }),
    defineField({
      name: "url",
      title: "URL",
      type: "url",
    }),
    defineField({
      name: "sourceType",
      title: "Tipo",
      type: "string",
      options: {
        list: [
          { title: "CENDOJ (sentencias)", value: "CENDOJ" },
          { title: "BOE (nacional)", value: "BOE" },
          { title: "CCAA (gazette autonómica)", value: "CCAA" },
          { title: "El País", value: "ElPais" },
          { title: "El Mundo", value: "ElMundo" },
          { title: "ABC", value: "ABC" },
          { title: "Catastro WFS", value: "Catastro" },
          { title: "Google Maps satélite", value: "Maps" },
          { title: "Otro", value: "Otro" },
        ],
      },
    }),
    defineField({
      name: "status",
      title: "Estado",
      type: "string",
      options: {
        list: [
          { title: "⏳ Pendiente", value: "pending" },
          { title: "✓ Aprobado", value: "approved" },
          { title: "✗ Rechazado", value: "rejected" },
        ],
      },
      initialValue: "pending",
    }),
    defineField({
      name: "note",
      title: "Nota",
      type: "string",
      description: "Opcional — añade contexto sobre por qué este enlace es relevante",
    }),
  ],

  preview: {
    select: { title: "label", subtitle: "status", url: "url" },
    prepare({ title, subtitle, url }) {
      const icon = subtitle === "approved" ? "✓" : subtitle === "rejected" ? "✗" : "⏳";
      return { title: `${icon} ${title ?? url ?? "—"}`, subtitle };
    },
  },
});
