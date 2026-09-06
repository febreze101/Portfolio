import {defineField, defineType} from 'sanity'

export default defineType({
    name: 'category',
    type: 'document',
    fields: [
        defineField({name: 'name', type: 'string'}),
        defineField({name: 'slug', type: 'slug', options: {source: 'name', maxLength: 96}}),
    ]
})
