export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  image: string;
  date: string;
  readTime: string;
  author: string;
  category: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "why-art-in-commercial-spaces-matters",
    title: "Why Art in Commercial Spaces Matters More Than You Think",
    excerpt: "From cafes to coworking spaces, the right artwork transforms a room from functional to memorable. Here's the business case for investing in your walls.",
    content: `Art in commercial spaces isn't just decoration — it's a strategic choice that affects how customers feel, how long they stay, and whether they come back.

Studies consistently show that environments with curated artwork increase dwell time by up to 30%. For a cafe, that means more coffee sold. For a coworking space, higher retention. For a hotel lobby, better first impressions that translate to reviews.

The best part? With platforms like Wallspace, you don't need to buy art outright. Free loan and revenue share arrangements mean you can rotate artwork regularly, keeping your space fresh without the upfront cost.

Whether you run a neighbourhood coffee shop or a boutique hotel, the art on your walls tells your customers who you are. Make it count.`,
    image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&h=500&fit=crop",
    date: "2026-04-08",
    readTime: "4 min read",
    author: "Wallspace Team",
    category: "For Venues",
  },
  {
    slug: "how-to-price-your-art-for-venues",
    title: "How to Price Your Art for Venue Placements",
    excerpt: "Pricing for galleries is one thing. Pricing for cafes, restaurants, and offices is another. Here's how to find the sweet spot.",
    content: `When a venue wants to display your work, the pricing conversation is different from a gallery sale. You're not just selling a piece — you're entering a partnership.

There are three main models: free loan (your art displayed for exposure), revenue share (you split sale proceeds with the venue), and direct purchase. Each has its place.

Free loan works best when you're building your name in a new area. Revenue share is ideal for high-traffic venues where sales are likely. Direct purchase suits venues that want permanent pieces.

The key is understanding what each venue needs and matching your pricing to their model. A cafe rotating art monthly has different needs than a hotel buying for their lobby.

Start with revenue share at 5-15% to the venue — it's the most flexible and aligns incentives for both sides.`,
    image: "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&h=500&fit=crop",
    date: "2026-04-03",
    readTime: "5 min read",
    author: "Wallspace Team",
    category: "For Artists",
  },
  {
    slug: "the-rise-of-art-in-hospitality",
    title: "The Rise of Art in Hospitality: A Trend That's Here to Stay",
    excerpt: "Hotels, restaurants, and bars are investing more in original artwork than ever. We explore why — and how independent artists are benefiting.",
    content: `The hospitality industry is in the middle of an art renaissance. From boutique hotels commissioning local photographers to restaurants curating rotating exhibitions, original artwork has become a core part of the guest experience.

This isn't just about aesthetics. Instagram culture means every corner of a venue is a potential photo opportunity. Original, eye-catching artwork drives social sharing, which drives footfall.

For independent artists, this shift is transformative. Where once you needed a gallery to reach buyers, now a well-placed piece in a busy restaurant can generate more visibility — and more sales — than a month-long exhibition.

The key is accessibility. Venues don't want to navigate the traditional art world. They want a simple way to find, trial, and display artwork. That's exactly what Wallspace was built to do.`,
    image: "https://images.unsplash.com/photo-1577083552431-6e5fd01988a5?w=800&h=500&fit=crop",
    date: "2026-03-28",
    readTime: "4 min read",
    author: "Wallspace Team",
    category: "Industry",
  },
  {
    slug: "5-tips-for-your-first-venue-placement",
    title: "5 Tips for Your First Venue Placement",
    excerpt: "Landing your first placement can feel daunting. Here are five practical tips from artists who've done it successfully.",
    content: `Your first venue placement is a milestone. It means someone looked at your work and thought "this belongs on our walls." Here's how to make it count.

1. Choose the right venue. Your moody black-and-white photography might not suit a bright children's cafe. Think about where your work fits naturally.

2. Be professional about delivery and installation. Arrive on time, bring proper hanging hardware, and leave the wall exactly as you found it when the placement ends.

3. Set clear terms upfront. Whether it's free loan, revenue share, or purchase — get it in writing. Wallspace handles this automatically, but if you're arranging independently, don't skip this step.

4. Promote the placement. Tag the venue on social media, mention it in your newsletter. The venue will appreciate the exposure, and it strengthens the relationship.

5. Follow up. Check in after a month. Ask how customers are responding. This builds the relationship for future placements and referrals.`,
    image: "https://images.unsplash.com/photo-1594732832278-abd644401426?w=800&h=500&fit=crop",
    date: "2026-03-20",
    readTime: "3 min read",
    author: "Wallspace Team",
    category: "For Artists",
  },
];
