import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'

// Providers
import Providers from './providers/providers'
import ToastContainer from './components/ToastContainer'
import TestnetBanner from './components/TestnetBanner'
import Analytics from './components/Analytics'

// Layouts
import MainLayout from './layouts/MainLayout'

// Pages
import HomePage from './pages/HomePage'
import ExplorePage from './pages/ExplorePage'
import ProposalsPage from './pages/ProposalsPage'
import CandidatePage from './pages/CandidatePage'
import CandidateDetailPage from './pages/CandidateDetailPage'
import TopicsPage from './pages/TopicsPage'
import VotePage from './pages/VotePage'
import VoteDetailPage from './pages/VoteDetailPage'
// import StatsPage from './pages/StatsPage'
// import TreasuryStatsPage from './pages/TreasuryStatsPage'
import SuccessPage from './pages/SuccessPage'
import VRGDAExplorePage from './pages/VRGDAExplorePage'
import LearnPage from './pages/LearnPage'
import RoundsPage from './pages/RoundsPage'
import NotFoundPage from './pages/NotFoundPage'
import ProposalEditorScreen from './components/ProposalEditor/ProposalEditorScreen'

// Styles
import '@rainbow-me/rainbowkit/styles.css'
import TopicDetailPage from './pages/TopicDetailPage'
import ProfilesPage from './pages/ProfilesPage'
import TraitsPage from './pages/TraitsPage'
import BrandPage from './pages/BrandPage'

function NounsDaoRedirect() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <Navigate to={`/vote/nouns/${id}`} replace />
}

function App() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Lilnouns.wtf",
    url: "https://www.lilnouns.wtf",
    description: "Lilnouns.wtf",
    publisher: {
      "@type": "Organization",
      name: "Lilnouns.wtf",
      url: "https://www.lilnouns.wtf",
      logo: "https://www.lilnouns.wtf/app-icon.jpeg",
    },
  }

  return (
    <>
      <Helmet>
        <title>Lilnouns.wtf | Lil Nouns DAO Governance Hub</title>
        <meta name="description" content="Lilnouns.wtf – Lil Nouns DAO" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
        
        {/* OpenGraph */}
        <meta property="og:url" content="https://www.lilnouns.wtf" />
        <meta property="og:site_name" content="Lilnouns.wtf – Lil Nouns DAO" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:title" content="Lilnouns.wtf – Lil Nouns DAO" />
        <meta property="og:description" content="Lilnouns.wtf" />
        
        {/* Apple Web App */}
        <meta name="apple-mobile-web-app-title" content="Lilnouns.wtf" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        
        {/* Robots */}
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta name="googlebot" content="index, follow" />
        
        {/* Keywords */}
        <meta name="keywords" content="Lilnouns.wtf" />
        
        {/* JSON-LD */}
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      </Helmet>
      
      <Providers>
        <div className="flex min-h-screen flex-col justify-between border-border-primary">
          <TestnetBanner />
          
          <Routes>
            {/* Main routes with layout */}
            <Route path="/" element={<MainLayout />}>
              <Route index element={<HomePage />} />
              <Route path="explore" element={<ExplorePage />} />
              <Route path="profile" element={<ProposalsPage />} />
              <Route path="profile/:address" element={<ProposalsPage />} />
              <Route path="vote" element={<VotePage />} />
              <Route path="vote/nouns" element={<VotePage />} />
              <Route path="vote/nounsdao" element={<VotePage />} />
              <Route path="vote/:id" element={<VoteDetailPage />} />
              <Route path="vote/nouns/:id" element={<VoteDetailPage />} />
              <Route path="vote/nounsdao/:id" element={<NounsDaoRedirect />} />
              <Route path="candidates" element={<CandidatePage />} />
              <Route path="candidates/:id" element={<CandidateDetailPage />} />
              <Route path="topics" element={<TopicsPage />} />
              <Route path="topics/:id" element={<TopicDetailPage/>} />
              <Route path="profiles" element={<ProfilesPage />} />
              {/* <Route path="stats" element={<StatsPage />} /> */}
              {/* <Route path="stats/treasury" element={<TreasuryStatsPage />} /> */}
              <Route path="learn" element={<LearnPage />} />
              <Route path="learn/:slug" element={<LearnPage />} />
              <Route path="rounds" element={<RoundsPage />} />
              <Route path="rounds/:round" element={<RoundsPage />} />
              <Route path="vrgda/explore" element={<VRGDAExplorePage />} />
              <Route path="traits" element={<TraitsPage />} />
              <Route path="brand" element={<BrandPage />} />
             
             {/* Proposal Editor */}
              <Route path="new" element={<ProposalEditorScreen />} />
              <Route path="new/proposal" element={<ProposalEditorScreen />} />
              <Route path="new/candidate" element={<ProposalEditorScreen />} />
              <Route path="new/topic" element={<ProposalEditorScreen />} />
              <Route path="new/:draftId" element={<ProposalEditorScreen />} />
              <Route path="update/candidate/:id" element={<ProposalEditorScreen />} />
              <Route path="update/proposal/:id" element={<ProposalEditorScreen />} />


              {/* Success page with dynamic parameters */}
              <Route path="success/:txHash/purchase/:nounId" element={<SuccessPage />} />

              {/* 404 page */}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
          
          <ToastContainer />
        </div>
      </Providers>
      
      <Analytics />
    </>
  )
}

export default App
