import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router-dom'
import Auction from '@/components/Auction'
import NounsFundsIdeas from '@/components/home/NounsFundsIdeas'
import ThisIsNouns from '@/components/home/ThisIsNouns'
import TheseAreNouns from '@/components/home/TheseAreNouns'
import ByTheNumbers from '@/components/home/ByTheNumbers'
import Faq from '@/components/home/Faq'
import StartJourney from '@/components/home/StartJourney'
import LearnAboutNounsDao from '@/components/home/LearnAboutNounsDao'
import { isVRGDANoun } from '@/utils/vrgdaUtils'
import { getCurrentAuctionNounId } from '@/data/auction/getCurrentAuctionNounId'
import JoinCommunity from '@/components/home/JoinCommunity'

const NounspotMap = () =>  {
  return (
    <section className="flex w-full max-w-[1680px] flex-col items-center gap-6 md:gap-12 px-6 md:px-10">
    <iframe
      src="https://nounspot.com/embed?sidebar=true&toggle=false&addspot=false&header=true"
      width="100%"
      height="700px"
      style={{ border: 0, borderRadius: '16px', overflow: 'hidden' }}
      allow="geolocation"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      title="Nounspot Map"
    />
  </section>
  )
}

export default function HomePage() {
  const [searchParams] = useSearchParams()
  const [currentAuctionId, setCurrentAuctionId] = useState<string | null>(null)
  const [showVRGDAPool, setShowVRGDAPool] = useState(false)
  
  const auctionIdParam = searchParams.get('auctionId')
  const frameParam = searchParams.get('frame')

  useEffect(() => {
    async function fetchCurrentAuction() {
      try {
        const id = await getCurrentAuctionNounId()
        setCurrentAuctionId(id)
        
        const auctionId = auctionIdParam ?? id
        const shouldShowVRGDA = auctionId ? isVRGDANoun(parseInt(auctionId)) : false
        setShowVRGDAPool(shouldShowVRGDA)
      } catch (error) {
        console.error('Failed to fetch current auction:', error)
      }
    }
    
    fetchCurrentAuction()
  }, [auctionIdParam])

  // Frame metadata for Farcaster frames
  const frameMetadata = frameParam ? {
    'fc:frame': 'vNext',
    'fc:frame:image': 'https://frames.paperclip.xyz/nounish-auction/v2/nouns',
    'fc:frame:button:1': 'Bid on Noun',
    'fc:frame:post_url': 'https://frames.paperclip.xyz/nounish-auction/v2/nouns'
  } : {}

  return (
    <>
      <Helmet>
        <title>lilnouns.club</title>
        <meta name="description" content="Into the world of lils. Learn how Lil Nouns DAO funds ideas through community governance." />
        <link rel="canonical" href="https://www.lilnouns.wtf/" />
        
        {/* Frame metadata for Farcaster */}
        {Object.entries(frameMetadata).map(([key, value]) => (
          <meta key={key} property={key} content={value} />
        ))}
      </Helmet>
      
      <div className="flex w-full flex-col items-center gap-[160px] pb-24 md:gap-[196px]">
        <div className="flex w-full flex-col items-center justify-center gap-[80px]">
          <section className="flex w-full max-w-[1680px] flex-col gap-4 px-6 pt-6 md:px-10 md:pt-10">
            <Auction initialAuctionId={auctionIdParam} />
          {/* <></> */}
          </section>

          <ThisIsNouns />
        </div>

        <NounsFundsIdeas />
        <ByTheNumbers />
        <TheseAreNouns />
        <NounspotMap />
        <StartJourney />
        <JoinCommunity />
        <LearnAboutNounsDao />
        <Faq />
      </div>
    </>
  )
}
