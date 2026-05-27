import { graphql } from "@/data/generated/cms";
import { graphQLFetch } from "../utils/graphQLFetch";
import { getCmsGraphqlUrl, normalizeCmsMediaUrl } from "@/utils/cmsUrl";

const query = graphql(/* GraphQL */ `
  query GetPosts {
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
        updatedAt
        createdAt
        discoverable
      }
    }
  }
`);

export async function getPostOverviews() {
  try {
    const data = await graphQLFetch(
      getCmsGraphqlUrl(),
      query,
      {},
      {
        next: { revalidate: 300 }, // Cache for 5 minutes
      },
    );

    const posts = (data as any)?.Posts?.docs
      ?.filter((post: any) => post != null)
      .filter((post: any) => post.discoverable)
      // Sort by createdAt descending (newest first)
      .sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || a.updatedAt).getTime();
        const dateB = new Date(b.createdAt || b.updatedAt).getTime();
        return dateB - dateA;
      });

    // Normalize heroImage URLs but keep raw URL for fallback
    const normalized = (posts ?? []).map((p: any) => {
      if (p.heroImage) {
        const rawUrl = p.heroImage.url;
        const normalizedUrl = normalizeCmsMediaUrl(p.heroImage.url, p.heroImage.filename);
        console.log('[getPostOverviews] Hero image URLs:', {
          slug: p.slug,
          rawUrl,
          normalizedUrl,
          filename: p.heroImage.filename,
        });
        return {
          ...p,
          heroImage: {
            ...p.heroImage,
            rawUrl, // Keep original URL from CMS
            url: normalizedUrl,
          },
        };
      }
      return p;
    });

    return normalized ?? [];

  } catch (error) {
    console.error("CMS fetch failed:", error);
    return [];
  }
}
