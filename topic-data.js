const TOPIC_DEMO = {
  platforms: ['YouTube', 'Facebook', 'Instagram', 'Threads'],
  topics: [
    { id: 'T01', name: '捷運尖峰增班', views: [18420, 12680, 9310, 2060] },
    { id: 'T02', name: '城市防災演練', views: [8620, 5310, 3720, null] },
    { id: 'T03', name: '校園減塑行動', views: [6190, 4280, 7550, 840] },
  ],
  airings: [
    { topic: 'T02', channel: 'tvbs', segment: 'tvbs-854', rating: 0.0052 },
    { topic: 'T01', channel: 'ebc', segment: 'ebc-2189', rating: 0.0068 },
    { topic: 'T01', channel: 'ftv', segment: 'ftv-2286', rating: 0.0046 },
    { topic: 'T03', channel: 'tvbs', segment: 'tvbs-2590', rating: null },
  ],
  categories: [
    ['社會', 0.05, 12], ['政治', -0.02, 10], ['財經', 0.04, 9],
    ['娛樂', 0.07, 8], ['天氣', -0.01, 6],
  ],
  cases: {
    T01: {
      channel: 'ebc', startMinute: 36, ratings: [0.68, 0.64, 0.71, 0.67, 0.65],
      breakIndex: 2, segment: 'ebc-2330', mixed: true,
      competitors: [['民視', '新聞／內容待確認', 0.58, 0.46], ['東森', '新聞／廣告', 0.64, 0.71]],
    },
    T02: {
      channel: 'tvbs', startMinute: 12, ratings: [0.45, 0.41, 0.52, 0.54, 0.51],
      breakIndex: 1, segment: 'tvbs-712', mixed: false,
      competitors: [['TVBS', '廣告', 0.45, 0.41], ['民視', '新聞／廣告', 0.49, 0.50]],
    },
    T03: {
      channel: 'tvbs', startMinute: 39, ratings: [0.57, 0.52, 0.48, 0.56],
      breakIndex: 2, segment: 'tvbs-2488', mixed: true,
      competitors: [['TVBS', '新聞／廣告', 0.52, 0.48], ['東森', '廣告／新聞', 0.57, 0.55]],
    },
  },
};

