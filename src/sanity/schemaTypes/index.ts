import { type SchemaTypeDefinition } from 'sanity'
import { caseType } from './caseType'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [caseType],
}
