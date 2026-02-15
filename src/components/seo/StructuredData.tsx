export function StructuredData() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "MaiaChat",
    description:
      "Self-hosted, open source AI assistant platform with multi-provider support, multi-channel messaging, RAG search, and autonomous agents.",
    applicationCategory: "CommunicationApplication",
    operatingSystem: "Linux, Windows, macOS",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Multi-provider AI (OpenAI, Anthropic, Google, xAI, local models)",
      "Multi-channel messaging (Telegram, Discord, Slack, WhatsApp, Web)",
      "RAG document search with vector retrieval",
      "Autonomous AI agents with background processing",
      "Scheduled tasks with cron automation",
      "Self-hosted Docker deployment",
      "14+ built-in tools including web search and code execution",
      "Multi-agent orchestration with custom profiles",
    ],
    url: process.env.NEXT_PUBLIC_APP_URL || "https://maiachat.app",
    downloadUrl: "https://github.com/alexcelewicz/MaiaChat_V2",
    softwareVersion: "2.0",
    license: "https://opensource.org/licenses/MIT",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
