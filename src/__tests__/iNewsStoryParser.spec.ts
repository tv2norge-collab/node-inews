import parseNsml from '../inewsStoryParser'

describe('inewsStoryParser', () => {
	it('parses multi-line anchored element (ae)', async () => {
		const nsml = `<nsml version="-//AVID//DTD NSML 1.0//EN">
		<story>
		<aeset>
		<ae id=0>
		<ap>]] S3.0 G 0 [[</ap>
		<mc>
		<ap>#kg bund TEST</ap>
		<ap>test</ap>
		<ap>;0.02</ap>
		</mc>
		</ae>
		</aeset>
		</story>
		`

		const output = await parseNsml(nsml)
		expect(output).toEqual({
			fields: {
				audioTime: undefined,
				backTime: undefined,
				cumeTime: undefined,
				layout: undefined,
				modifyDate: undefined,
				pageNumber: undefined,
				runsTime: undefined,
				tapeTime: undefined,
				title: undefined,
				totalTime: undefined,
				videoId: undefined,
			},
			meta: {},
			cues: [['#kg bund TEST', 'test', ';0.02']],
			attachments: [],
		})
	})
	it('omits empty paragraphs (ap) in a multi-line anchored element', async () => {
		const nsml = `<nsml version="-//AVID//DTD NSML 1.0//EN">
		<story>
		<aeset>
		<ae id=0>
		<ap>]] S3.0 G 0 [[</ap>
		<ap>#kg bund TEST</ap>
		<ap></ap>
		<ap></ap>
		<ap>test</ap>
		<ap></ap>
		<ap>;0.02</ap>
		</ae>
		</aeset>
		</story>
		`

		const output = await parseNsml(nsml)
		expect(output).toEqual({
			fields: {
				audioTime: undefined,
				backTime: undefined,
				cumeTime: undefined,
				layout: undefined,
				modifyDate: undefined,
				pageNumber: undefined,
				runsTime: undefined,
				tapeTime: undefined,
				title: undefined,
				totalTime: undefined,
				videoId: undefined,
			},
			meta: {},
			cues: [['#kg bund TEST', 'test', ';0.02']],
			attachments: [],
		})
	})
	it('omits empty paragraphs (ap) in a multi-line anchored element with machine control (mc)', async () => {
		const nsml = `<nsml version="-//AVID//DTD NSML 1.0//EN">
		<story>
		<aeset>
		<ae id=0>
		<ap>]] S3.0 G 0 [[</ap>
		<mc>
		<ap>#kg bund TEST</ap>
		<ap></ap>
		<ap></ap>
		<ap>test</ap>
		<ap></ap>
		<ap>;0.02</ap>
		</mc>
		</ae>
		</aeset>
		</story>
		`

		const output = await parseNsml(nsml)
		expect(output).toEqual({
			fields: {
				audioTime: undefined,
				backTime: undefined,
				cumeTime: undefined,
				layout: undefined,
				modifyDate: undefined,
				pageNumber: undefined,
				runsTime: undefined,
				tapeTime: undefined,
				title: undefined,
				totalTime: undefined,
				videoId: undefined,
			},
			meta: {},
			cues: [['#kg bund TEST', 'test', ';0.02']],
			attachments: [],
		})
	})
	it('maintains order (inserts empty cues in place of elements containing only an empty paragraph)', async () => {
		const nsml = `<nsml version="-//AVID//DTD NSML 1.0//EN">
		<story>
		<aeset>
		<ae id=0>
		<ap></ap>
		</ae>
		<ae id=1>
		<ap>]] S3.0 G 0 [[</ap>
		<ap></ap>
		</ae>
		<ae id=2>
		<ap>]] S3.0 G 0 [[</ap>
		<mc>
		<ap></ap>
		</mc>
		</ae>
		<ae id=3>
		<ap>]] S3.0 G 0 [[</ap>
		<mc>
		<ap>#kg bund TEST</ap>
		<ap>test</ap>
		<ap>;0.02</ap>
		</mc>
		</ae>
		<ae id=4>
		<ap>]] S3.0 G 0 [[</ap>
		<mc>
		<ap></ap>
		</mc>
		</ae>
		<ae id=5>
		<ap>]] S3.0 G 0 [[</ap>
		<mc>
		<ap>#kg bund TEST2</ap>
		<ap>test2</ap>
		<ap>;0.11</ap>
		</mc>
		</ae>
		</aeset>
		</story>
		`

		const output = await parseNsml(nsml)
		expect(output).toEqual({
			fields: {
				audioTime: undefined,
				backTime: undefined,
				cumeTime: undefined,
				layout: undefined,
				modifyDate: undefined,
				pageNumber: undefined,
				runsTime: undefined,
				tapeTime: undefined,
				title: undefined,
				totalTime: undefined,
				videoId: undefined,
			},
			meta: {},
			cues: [[], [], [], ['#kg bund TEST', 'test', ';0.02'], [], ['#kg bund TEST2', 'test2', ';0.11']],
			attachments: [],
		})
	})

	it('parses <aeset-atts>', async () => {
		const nsml = `<nsml version="-//AVID//DTD NSML 1.0//EN">
		<story>
		<aeset>
		<ae id=0>
		<ap>]] S3.0 M 0 [[</ap>
		<mc>
		<ap>pilot ]] 1 YNYAM 0 [[ SN-TEMA / Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag / Russisk avhopper har søkt asyl i Norge / Inn: 00:00</ap>
		</mc>
		</ae>
		</aeset>
		</story>
		<aeset-atts>
		<attachment id=0>
		<![CDATA[<AttachmentContent><mos><mosID>PILOT</mosID><mosItemBrowserProgID>VCPAxFiller.VCPTemplateFiller</mosItemBrowserProgID><mosItemEditorProgID>VCPAxFiller.VCPTemplateFiller</mosItemEditorProgID><mosAbstract>SN-TEMA / Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag / Russisk avhopper har søkt asyl i Norge / Inn: 00:00</mosAbstract><objGroup>Nyheter</objGroup><objID>2133727</objID><objSlug>SN-TEMA / Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag / Russisk avhopper har sø]]><![CDATA[kt asyl i Norge / Inn: 00:00</objSlug><objType>PILOT</objType><objTB>0</objTB><objRev>1</objRev><objDur>1</objDur><status></status><objAir></objAir><createdBy>PILOT</createdBy><changedBy></changedBy><changed>2023-01-16T05:39:16Z</changed><description>SN-TEMA / Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag / Russisk avhopper har søkt asyl i Norge / Inn: 00:00</description><mosExternalMetadata><mosScope>PLAYLIST</mosScope><mosSchema>http://www.vizrt.com/mosObj/continueCount</mos]]><![CDATA[Schema><mosPayload><continueCount>-1</continueCount></mosPayload></mosExternalMetadata><mosExternalMetadata><mosScope>PLAYLIST</mosScope><mosSchema>http://www.vizrt.com/mosObj/data</mosSchema><mosPayload><data><entry name="data"><entry name="000_type" description="Type"><entry name="000_type" description="Type" type="integer" min="0" max="1000">3</entry></entry><entry name="001_headline" description="Headline"><entry name="001_headline" description="Headline" type="text" singleline="true" lo]]><![CDATA[cation="1/1/1/5/1/1">Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag</entry></entry><entry name="002_text" description="Text"><entry name="002_text" description="Text" type="text" wrap="true" location="1/1/1/1/1">Russisk avhopper har søkt asyl i Norge</entry></entry><entry name="003_color" description="Color"><entry name="003_color" description="Color" type="integer" min="0" max="1000">1</entry></entry><entry name="005_addontype" description="AddonType"><entry name="005_addontyp]]><![CDATA[e" description="AddonType" type="integer" min="0" max="1">0</entry></entry><entry name="006_image" description="Image"><entry name="006_image" description="Image" type="image" image_prefix="/" location="1/2/2/1">IMAGE*/Onair/Sport/Tdf/2011/Images/control_image_invisible</entry></entry><entry name="007_geom" description="Geom"><entry name="007_geom" description="Geom" type="geom" geom_prefix="/" location="1/2/2/2"/></entry><entry name="008_tickertype" description="TickerType"><entry name="008]]><![CDATA[_tickertype" description="TickerType" type="richtext" singleline="true" location="1/2/3/1"/></entry><entry name="009_tickercode" description="TickerCode"><entry name="009_tickercode" description="TickerCode" type="richtext" singleline="true" location="1/2/3/2"/></entry><entry name="010_tickervalue" description="TickerValue"><entry name="010_tickervalue" description="TickerValue" type="richtext" singleline="true" location="1/2/3/3"/></entry><entry name="011_tickerchange" description="TickerCh]]><![CDATA[ange"><entry name="011_tickerchange" description="TickerChange" type="richtext" singleline="true" location="1/2/3/4"/></entry><entry name=""><entry name="" type="widestring">BACKGROUNDEND</entry></entry><entry name="001_name"><entry name="001_name" type="widestring"/></entry><entry name="ConceptName"><entry name="ConceptName" type="widestring">Nyheter</entry></entry><entry name="ContentData"><entry name="ContentData" type="widestring">001_headline#Andrej Medvedev ble pågrepet i Pasvikdalen ]]><![CDATA[natt til fredag$002_text#Russisk avhopper har søkt asyl i Norge</entry></entry><entry name="ContentVariant"><entry name="ContentVariant" type="widestring">TOPICTEXT_LOWER_WITH_HEADING</entry></entry><entry name="Mosart"><entry name="Mosart" type="widestring">Mosart=L|00:00|B</entry></entry><entry name="GFXIID"><entry name="GFXIID" type="widestring">393CD79C-C675-4B45-89F7-DB1B41737148</entry></entry><entry name="Ardome"><entry name="Ardome" type="widestring">"Code=60","Line1=Andrej Medvedev]]><![CDATA[ ble pågrepet i Pasvikdalen natt til fredag","Line2=Russisk avhopper har søkt asyl i Norge","In=00:00","Out="</entry></entry></entry></data></mosPayload></mosExternalMetadata><mosExternalMetadata><mosScope>PLAYLIST</mosScope><mosSchema>http://www.vizrt.com/mosObj/pilot/additional</mosSchema><mosPayload><concept>Nyheter</concept><variant>Default</variant><template>Infosuper</template></mosPayload></mosExternalMetadata><itemID>1</itemID></mos></AttachmentContent>]]>
		</attachment>
		</aeset-atts>
		`

		const output = await parseNsml(nsml)
		expect(output).toEqual({
			fields: {
				audioTime: undefined,
				backTime: undefined,
				cumeTime: undefined,
				layout: undefined,
				modifyDate: undefined,
				pageNumber: undefined,
				runsTime: undefined,
				tapeTime: undefined,
				title: undefined,
				totalTime: undefined,
				videoId: undefined,
			},
			meta: {},
			cues: [
				[
					']] S3.0 M 0 [[',
					'pilot ]] 1 YNYAM 0 [[ SN-TEMA / Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag / Russisk avhopper har søkt asyl i Norge / Inn: 00:00',
				],
			],
			attachments: [
				'<AttachmentContent><mos><mosID>PILOT</mosID><mosItemBrowserProgID>VCPAxFiller.VCPTemplateFiller</mosItemBrowserProgID><mosItemEditorProgID>VCPAxFiller.VCPTemplateFiller</mosItemEditorProgID><mosAbstract>SN-TEMA / Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag / Russisk avhopper har søkt asyl i Norge / Inn: 00:00</mosAbstract><objGroup>Nyheter</objGroup><objID>2133727</objID><objSlug>SN-TEMA / Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag / Russisk avhopper har søkt asyl i Norge / Inn: 00:00</objSlug><objType>PILOT</objType><objTB>0</objTB><objRev>1</objRev><objDur>1</objDur><status></status><objAir></objAir><createdBy>PILOT</createdBy><changedBy></changedBy><changed>2023-01-16T05:39:16Z</changed><description>SN-TEMA / Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag / Russisk avhopper har søkt asyl i Norge / Inn: 00:00</description><mosExternalMetadata><mosScope>PLAYLIST</mosScope><mosSchema>http://www.vizrt.com/mosObj/continueCount</mosSchema><mosPayload><continueCount>-1</continueCount></mosPayload></mosExternalMetadata><mosExternalMetadata><mosScope>PLAYLIST</mosScope><mosSchema>http://www.vizrt.com/mosObj/data</mosSchema><mosPayload><data><entry name="data"><entry name="000_type" description="Type"><entry name="000_type" description="Type" type="integer" min="0" max="1000">3</entry></entry><entry name="001_headline" description="Headline"><entry name="001_headline" description="Headline" type="text" singleline="true" location="1/1/1/5/1/1">Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag</entry></entry><entry name="002_text" description="Text"><entry name="002_text" description="Text" type="text" wrap="true" location="1/1/1/1/1">Russisk avhopper har søkt asyl i Norge</entry></entry><entry name="003_color" description="Color"><entry name="003_color" description="Color" type="integer" min="0" max="1000">1</entry></entry><entry name="005_addontype" description="AddonType"><entry name="005_addontype" description="AddonType" type="integer" min="0" max="1">0</entry></entry><entry name="006_image" description="Image"><entry name="006_image" description="Image" type="image" image_prefix="/" location="1/2/2/1">IMAGE*/Onair/Sport/Tdf/2011/Images/control_image_invisible</entry></entry><entry name="007_geom" description="Geom"><entry name="007_geom" description="Geom" type="geom" geom_prefix="/" location="1/2/2/2"></entry></entry><entry name="008_tickertype" description="TickerType"><entry name="008_tickertype" description="TickerType" type="richtext" singleline="true" location="1/2/3/1"></entry></entry><entry name="009_tickercode" description="TickerCode"><entry name="009_tickercode" description="TickerCode" type="richtext" singleline="true" location="1/2/3/2"></entry></entry><entry name="010_tickervalue" description="TickerValue"><entry name="010_tickervalue" description="TickerValue" type="richtext" singleline="true" location="1/2/3/3"></entry></entry><entry name="011_tickerchange" description="TickerChange"><entry name="011_tickerchange" description="TickerChange" type="richtext" singleline="true" location="1/2/3/4"></entry></entry><entry name=""><entry name="" type="widestring">BACKGROUNDEND</entry></entry><entry name="001_name"><entry name="001_name" type="widestring"></entry></entry><entry name="ConceptName"><entry name="ConceptName" type="widestring">Nyheter</entry></entry><entry name="ContentData"><entry name="ContentData" type="widestring">001_headline#Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag$002_text#Russisk avhopper har søkt asyl i Norge</entry></entry><entry name="ContentVariant"><entry name="ContentVariant" type="widestring">TOPICTEXT_LOWER_WITH_HEADING</entry></entry><entry name="Mosart"><entry name="Mosart" type="widestring">Mosart=L|00:00|B</entry></entry><entry name="GFXIID"><entry name="GFXIID" type="widestring">393CD79C-C675-4B45-89F7-DB1B41737148</entry></entry><entry name="Ardome"><entry name="Ardome" type="widestring">"Code=60","Line1=Andrej Medvedev ble pågrepet i Pasvikdalen natt til fredag","Line2=Russisk avhopper har søkt asyl i Norge","In=00:00","Out="</entry></entry></entry></data></mosPayload></mosExternalMetadata><mosExternalMetadata><mosScope>PLAYLIST</mosScope><mosSchema>http://www.vizrt.com/mosObj/pilot/additional</mosSchema><mosPayload><concept>Nyheter</concept><variant>Default</variant><template>Infosuper</template></mosPayload></mosExternalMetadata><itemID>1</itemID></mos></AttachmentContent>',
			],
		})
	})
})
