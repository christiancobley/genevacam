exports.handler = async () => {

    const feeds = [

        {
            name: "Genève",
            url: "https://www.rts.ch/info/regions/geneve/?format=rss/news"
        },

        {
            name: "Suisse",
            url: "https://www.rts.ch/info/suisse?format=rss/news"
        },

        {
            name: "RTS Info",
            url: "https://www.rts.ch/info/toute-info/?format=rss/news"
        },

        {
            name: "Sport",
            url: "https://www.rts.ch/sport/tout-le-sport/?format=rss/news"
        }

    ];

    const headlines = [];

    for (const feed of feeds) {

        try {

            const response =
                await fetch(feed.url);

            const xml =
                await response.text();

            const matches =
                [
                    ...xml.matchAll(
                        /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g
                    )
                ];

            matches
                .slice(1, 6)
                .forEach(match => {

                    const title =
                        (match[1] || match[2] || "")
                        .replace(/\s+/g, " ")
                        .trim();

                    if (title) {

                        headlines.push(
                            `${feed.name}: ${title}`
                        );

                    }

                });

        } catch (err) {

            console.log(err);

        }

    }

    return {

        statusCode: 200,

        body: JSON.stringify(headlines)

    };

};