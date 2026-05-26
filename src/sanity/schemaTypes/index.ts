import { type SchemaTypeDefinition } from 'sanity'
import { caseType } from './caseType'
import { researchLinkType } from './researchLinkType'

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [caseType, researchLinkType],
}
