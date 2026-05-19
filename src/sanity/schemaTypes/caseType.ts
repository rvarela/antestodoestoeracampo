import { defineField, defineType } from "sanity";

const REGIONS = [
  "Andalucía",
  "Aragón",
  "Asturias",
  "Baleares",
  "Canarias",
  "Cantabria",
  "Castilla-La Mancha",
  "Castilla y León",
  "Cataluña",
  "Comunidad Valenciana",
  "Extremadura",
  "Galicia",
  "La Rioja",
  "Madrid",
  "Murcia",
  "Navarra",
  "País Vasco",
];

const EVENT_TYPES = [
  { title: "🔥 Incendio", value: "fire" },
  { title: "🏠 Compraventa", value: "purchase" },
  { title: "📋 Recalificación", value: "rezoning" },
  { title: "🔨 Permiso de obra", value: "permit" },
  { title: "🏗️ Construcción", value: "construction" },
  { title: "⚖️ Judicial", value: "judicial" },
  { title: "🏛️ Político", value: "political" },
  { title: "📰 Otro", value: "other" },
];

export const caseType = defineType({
  name: "case",
  title: "Case",
  type: "document",
  fields: [
    // ── Identity ─────────────────────────────────────────────────────
    defineField({
      name: "title",
      title: "Título",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug (URL)",
      type: "slug",
      options: { source: "title" },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "hidden",
      title: "Ocultar",
      type: "boolean",
      initialValue: false,
      description: "Si está activado, el caso no aparece en la lista ni es accesible.",
    }),
    defineField({
      name: "order",
      title: "Orden de visualización",
      type: "number",
    }),

    // ── Location & Classification ─────────────────────────────────────
    defineField({
      name: "region",
      title: "Comunidad Autónoma",
      type: "string",
      options: { list: REGIONS },
    }),
    defineField({
      name: "municipality",
      title: "Municipio",
      type: "string",
    }),
    defineField({
      name: "year",
      title: "Año del incendio",
      type: "number",
    }),
    defineField({
      name: "hectares",
      title: "Hectáreas calcinadas",
      type: "number",
    }),
    defineField({
      name: "status",
      title: "Estado judicial",
      type: "string",
      options: {
        list: [
          "Sentencia firme",
          "En investigación",
          "Archivado",
          "Sobreseído",
        ],
      },
    }),
    defineField({
      name: "outcome",
      title: "Resultado urbanístico",
      type: "string",
      description: "Qué se construyó o planea construir (ej. 'Parque temático construido')",
    }),
    defineField({
      name: "accentColor",
      title: "Color de acento (hex)",
      type: "string",
      initialValue: "#C4622D",
    }),
    defineField({
      name: "coordinates",
      title: "Coordenadas",
      type: "object",
      fields: [
        defineField({ name: "lat", title: "Latitud", type: "number" }),
        defineField({ name: "lng", title: "Longitud", type: "number" }),
      ],
    }),

    // ── Content ───────────────────────────────────────────────────────
    defineField({
      name: "excerpt",
      title: "Extracto (para la tarjeta)",
      type: "text",
      rows: 3,
      validation: (Rule) => Rule.max(280),
    }),
    defineField({
      name: "overview",
      title: "Descripción general",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "coverImage",
      title: "Imagen de portada",
      type: "image",
      options: { hotspot: true },
    }),

    // ── Timeline ──────────────────────────────────────────────────────
    defineField({
      name: "timeline",
      title: "Cronología",
      type: "array",
      of: [
        {
          type: "object",
          preview: {
            select: { title: "title", subtitle: "date" },
          },
          fields: [
            defineField({ name: "date", title: "Fecha", type: "string", description: "Ej: '1992-08-11' o '1992' o 'Agosto 1992'" }),
            defineField({ name: "title", title: "Evento", type: "string" }),
            defineField({ name: "description", title: "Descripción", type: "text", rows: 3 }),
            defineField({
              name: "type",
              title: "Tipo",
              type: "string",
              options: { list: EVENT_TYPES },
              initialValue: "other",
            }),
          ],
        },
      ],
    }),

    // ── Political Connections ─────────────────────────────────────────
    defineField({
      name: "connections",
      title: "Conexiones políticas",
      type: "array",
      of: [
        {
          type: "object",
          preview: {
            select: { title: "name", subtitle: "role" },
          },
          fields: [
            defineField({ name: "name", title: "Nombre", type: "string" }),
            defineField({ name: "role", title: "Cargo", type: "string" }),
            defineField({ name: "party", title: "Partido", type: "string" }),
            defineField({ name: "connection", title: "Vínculo", type: "text", rows: 3 }),
          ],
        },
      ],
    }),

    // ── Judicial ──────────────────────────────────────────────────────
    defineField({
      name: "judicial",
      title: "Historia judicial",
      type: "array",
      of: [
        {
          type: "object",
          preview: {
            select: { title: "court", subtitle: "date" },
          },
          fields: [
            defineField({ name: "court", title: "Tribunal", type: "string" }),
            defineField({ name: "date", title: "Fecha", type: "string" }),
            defineField({
              name: "result",
              title: "Resultado",
              type: "string",
              options: {
                list: [
                  { title: "Condenado", value: "convicted" },
                  { title: "Absuelto", value: "acquitted" },
                  { title: "Pendiente", value: "pending" },
                  { title: "Archivado", value: "archived" },
                ],
              },
            }),
            defineField({ name: "description", title: "Descripción", type: "text", rows: 3 }),
          ],
        },
      ],
    }),

    // ── Sources ───────────────────────────────────────────────────────
    defineField({
      name: "sources",
      title: "Fuentes",
      type: "array",
      of: [
        {
          type: "object",
          preview: {
            select: { title: "label", subtitle: "type" },
          },
          fields: [
            defineField({ name: "label", title: "Descripción", type: "string" }),
            defineField({ name: "url", title: "URL", type: "url" }),
            defineField({
              name: "type",
              title: "Tipo de fuente",
              type: "string",
              options: {
                list: ["EGIF", "Catastro", "BOE", "Sentencia", "Prensa", "Otro"],
              },
            }),
          ],
        },
      ],
    }),
  ],

  orderings: [
    { title: "Orden de visualización", name: "orderAsc", by: [{ field: "order", direction: "asc" }] },
    { title: "Año (reciente primero)", name: "yearDesc", by: [{ field: "year", direction: "desc" }] },
  ],

  preview: {
    select: { title: "title", subtitle: "municipality", status: "status" },
    prepare({ title, subtitle, status }) {
      return { title, subtitle: `${subtitle ?? "—"} · ${status ?? "sin estado"}` };
    },
  },
});
