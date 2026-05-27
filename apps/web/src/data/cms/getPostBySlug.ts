import { graphql } from "@/data/generated/cms";
import { graphQLFetch } from "../utils/graphQLFetch";
import { getCmsGraphqlUrl, normalizeCmsMediaUrl } from "@/utils/cmsUrl";
import { unstable_cache } from "@/utils/viteCache";

const query = graphql(/* GraphQL */ `
  query GetPostBySlug {
    Posts {
      docs {
        id
        slug
        title
        description
        heroImage {
          url
          filename
          alt
        }
        content
        keywords {
          value
        }
        createdAt
        updatedAt
      }
    }
  }
`);

const fetchPostBySlug = unstable_cache(
  async (slug: string) => {
    const data = await graphQLFetch(
      getCmsGraphqlUrl(),
      query,
      {}
    );

    // Filter by slug client-side since Payload 3.0 GraphQL doesn't support where clause filtering
    const post = (data as any)?.Posts?.docs?.find((p: any) => p.slug === slug) ?? null;
    if (!post) return null;
    if (post.heroImage) {
      post.heroImage.rawUrl = post.heroImage.url; // Keep original URL from CMS
      post.heroImage.url = normalizeCmsMediaUrl(post.heroImage.url, post.heroImage.filename);
    }
    return post;
  },
  ['post-by-slug'],
  { revalidate: 300 } // Cache for 5 minutes
);

export async function getPostBySlug(slug: string) {
  return fetchPostBySlug(slug);
}
