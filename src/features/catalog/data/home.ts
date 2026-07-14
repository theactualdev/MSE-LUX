/** Mock content for the home page storytelling sections (brand story, Instagram gallery, testimonials). */

export const brandStory = {
  image: 'https://picsum.photos/seed/mselux-atelier/1200/1500',
  imageAlt: 'Artisan hands threading beads at the MSE Lux atelier in Lagos',
  eyebrow: 'Our Story',
  heading: 'Handmade in Lagos, worn everywhere',
  paragraphs: [
    "MSE Lux began on a workbench in Lagos, where every strand of beads is still cut, threaded, and finished by hand. What started as a small collection for friends and family has grown into a full atelier — but the process hasn't changed.",
    'Each piece passes through the hands of a dedicated artisan before it reaches yours: measured, strung, and checked for the kind of quality that machines can\'t replicate. It\'s slower, but it\'s the only way we know how to make something worth keeping.',
  ],
}

export interface InstagramPost {
  src: string
  alt: string
  href?: string
}

export const instagramPosts: InstagramPost[] = [
  { src: 'https://picsum.photos/seed/mselux-ig-1/600/600', alt: 'Model wearing a layered gold beaded necklace' },
  { src: 'https://picsum.photos/seed/mselux-ig-2/600/600', alt: 'Close-up of hand-strung beadwork bracelet stack' },
  { src: 'https://picsum.photos/seed/mselux-ig-3/600/600', alt: 'Artisan at work threading beads in the Lagos atelier' },
  { src: 'https://picsum.photos/seed/mselux-ig-4/600/600', alt: 'Flatlay of earrings and rings from the new arrivals edit' },
  { src: 'https://picsum.photos/seed/mselux-ig-5/600/600', alt: 'Bride wearing a pearl and gold statement necklace' },
  { src: 'https://picsum.photos/seed/mselux-ig-6/600/600', alt: 'Model styling a beaded choker for a night out' },
]

export interface Testimonial {
  quote: string
  author: string
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "The craftsmanship is unreal — you can tell every bead was placed by hand. My necklace gets stopped-in-the-street compliments every time I wear it.",
    author: 'Amara O.',
  },
  {
    quote:
      'I ordered a custom bridal set and it arrived exactly as we discussed, packaged beautifully and right on time for the wedding. Could not recommend MSE Lux more.',
    author: 'Chidinma A.',
  },
  {
    quote:
      "These pieces feel special in a way fast fashion jewelry never does. It's become my go-to for gifts — and for treating myself.",
    author: 'Folake B.',
  },
]
