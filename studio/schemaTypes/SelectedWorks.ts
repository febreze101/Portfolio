import { defineType, defineField} from 'sanity'

export default defineType({
    name: 'selectedWorks',
    type: 'document',
    fields: [
        defineField({
        name: 'categories',
        type: 'array',
        of: [{ type: 'reference', to: [{ type: 'category' }] }], // array OF references TO category docs
        }),

        defineField({
        name: 'fullDescription',
        type: 'array',
        of: [{ type: 'block' }], // 'block' is Portable Text's building unit — a paragraph/heading/list item
        }),

        defineField({
            name: 'name', 
            type: 'string'
        }),

        defineField({
            name: 'slug', 
            type: 'slug', 
            options: {source: 'name', maxLength: 96}
        }),

        defineField({
            name: 'thumbnail',
            type: 'image'
        }),

        defineField({
            name: 'heroImage',
            type: 'image'
        }),

        defineField({
            name: 'images',
            type: 'array',
            of: [{ type: 'image' }]
        }),

        defineField({
            name: 'summary',
            type: 'text',
        }),

        defineField({
            name: 'link',
            type: 'url'
        })
    ]
})

