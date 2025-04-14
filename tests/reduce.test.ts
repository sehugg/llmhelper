import assert from 'node:assert';
import test from 'node:test';
import { SorensenDiceSimilarity, DefaultTextParser, ConsoleLogger, RelativeSummarizerConfig, Summarizer, NullLogger, Sentence } from "ts-textrank";
import { LogOutputReducer, TextRankReducer } from '../src/reduce.js';
import { LLMMessage } from '../src/types.js';
import { estimateMessagesLength, LLMHelper } from '../src/llm.js';

test('reduce', async (t) => {
    const output = await new TextRankReducer().reduce(sample, 0.4);
    console.log(output);
    assert.ok(output.includes('TextRank algo'));
});

test('reduce2', async (t) => {
    const output = await new TextRankReducer().reduce(sample2, 0.1);
    console.log('OUTPUT',output);
    assert.ok(output.includes('source: not found'));
});

test('reduce msgs', async (t) => {
    const reducer = new LogOutputReducer();
    const msgs : LLMMessage[] = [
        { role: 'user', content: 'This is a test message.' },
        { role: 'user', content: sample },
        { role: 'user', content: 'This is a test message.' },
    ];
    const msgs2 = await reducer.reduce(msgs, 200);
    console.log(msgs2);
    if (!msgs2) throw new Error('Expected messages to be reduced');
    assert.equal(msgs2[0].content, 'This is a test message.');
    assert.equal(msgs2[2].content, 'This is a test message.');
    const msgs3 = await reducer.reduce(msgs2, 200);
    assert.ok(msgs3 === null);
});

test('reduce llm helper', async (t) => {
    let rootllm = new LLMHelper().addObject(sample + sample + sample);
    let llm = await rootllm.reduceContext();
    assert.ok(rootllm !== llm);
    assert.ok(estimateMessagesLength(llm.getMessages()) < estimateMessagesLength(rootllm.getMessages()) / 2);
    assert.equal(rootllm.maxTokens, llm.maxTokens);
});

const sample = `
Skip to content

Navigation Menu

Toggle navigation

[]

Sign in

-   Product []
    -   []
        Actions

        Automate any workflow
    -   []
        Packages

        Host and manage packages
    -   []
        Security

        Find and fix vulnerabilities
    -   []
        Codespaces

        Instant dev environments
    -   []
        GitHub Copilot

        Write better code with AI
    -   []
        Code review

        Manage code changes
    -   []
        Issues

        Plan and track work
    -   []
        Discussions

        Collaborate outside of code

    Explore
    -   All features
    -   Documentation []
    -   GitHub Skills []
    -   Blog []
-   Solutions []
    By size
    -   Enterprise
    -   Teams
    -   Startups

    By industry
    -   Healthcare
    -   Financial services
    -   Manufacturing

    By use case
    -   CI/CD & Automation
    -   DevOps
    -   DevSecOps
-   Resources []
    Topics
    -   AI
    -   DevOps
    -   Security
    -   Software Development
    -   View all

    Explore
    -   Learning Pathways []
    -   White papers, Ebooks, Webinars []
    -   Customer Stories
    -   Partners []
-   Open Source []
    -   
        GitHub Sponsors

        Fund open source developers

    -   
        The ReadME Project

        GitHub community articles

    Repositories
    -   Topics
    -   Trending
    -   Collections
-   Enterprise []
    -   []
        Enterprise platform

        AI-powered developer platform

    Available add-ons
    -   []
        Advanced Security

        Enterprise-grade security features
    -   []
        GitHub Copilot

        Enterprise-grade AI features
    -   []
        Premium Support

        Enterprise-grade 24/7 support
-   Pricing

[]

Search or jump to...

[]

Search code, repositories, users, issues, pull requests...

Search

[]

Clear

[]

[] [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] [] []
[] [] [] [] [] [] [] [] [] []

[]

Search syntax tips

Provide feedback

[]

We read every piece of feedback, and take your input very seriously.

Include my email address so I can be contacted

Cancel

Submit feedback

Saved searches

Use saved searches to filter your results more quickly

[]

Name

Query

To see all available qualifiers, see our documentation.

Cancel

Create saved search

Sign in

Sign up

Reseting focus

[] You signed in with another tab or window. Reload to refresh your
session. You signed out in another tab or window. Reload to refresh your
session. You switched accounts on another tab or window. Reload to
refresh your session.

[]

Dismiss alert

[]

{{ message }}

[] NachoBrito / ts-textrank Public

-   []Notifications You must be signed in to change notification
    settings

-   []Fork 3

-   [] Star 7

Typescript implementation of the TextRank algorithm

[] www.npmjs.com/package/ts-textrank

[] 7 stars [] 3 forks [] Branches [] Tags [] Activity

[] Star

[]Notifications You must be signed in to change notification settings

-   [] Code
-   [] Issues 1
-   [] Pull requests 0
-   [] Actions
-   [] Projects 0
-   [] Security
-   [] Insights

[]

Additional navigation options

-    [] Code
-    [] Issues
-    [] Pull requests
-    [] Actions
-    [] Projects
-    [] Security
-    [] Insights

NachoBrito/ts-textrank

[]

This commit does not belong to any branch on this repository, and may
belong to a fork outside of the repository.

[]

 main

[]

[]Branches[]Tags

[][]

Go to file

[]

Code[]

[]

Folders and files

+-------------+-------------+-------------+-------------+-------------+
| Name        |             | Name        | Last commit | Last commit |
|             |             |             | message     | date        |
+=============+=============+=============+=============+=============+
| La          |             |             |             |             |
| test commit |             |             |             |             |
|             |             |             |             |             |
|             |             |             |             |             |
|             |             |             |             |             |
| History     |             |             |             |             |
|             |             |             |             |             |
| []47        |             |             |             |             |
| Commits     |             |             |             |             |
|             |             |             |             |             |
| []          |             |             |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| .githu      |             | .githu      |             |             |
| b/workflows |             | b/workflows |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| contrib     |             | contrib     |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| src         |             | src         |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| tests/un    |             | tests/un    |             |             |
| it/TextRank |             | it/TextRank |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| .gitignore  |             | .gitignore  |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| .npmignore  |             | .npmignore  |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| .pret       |             | .pret       |             |             |
| tierrc.json |             | tierrc.json |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| README.md   |             | README.md   |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| jes         |             | jes         |             |             |
| t.config.ts |             | t.config.ts |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| p           |             | p           |             |             |
| ackage.json |             | ackage.json |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| publish.sh  |             | publish.sh  |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| ts          |             | ts          |             |             |
| config.json |             | config.json |             |             |
+-------------+-------------+-------------+-------------+-------------+
| []          |             | []          |             |             |
|             |             |             |             |             |
| yarn.lock   |             | yarn.lock   |             |             |
+-------------+-------------+-------------+-------------+-------------+
| View all    |             |             |             |             |
| files       |             |             |             |             |
+-------------+-------------+-------------+-------------+-------------+

Repository files navigation

-   []README

[]

[Tests]

ts-textrank

[]

ts-textrank is a Typescript implementation of the TextRank algorithm.

Install

[]

Using npm:

    $ npm install ts-textrank

Using yarn:

    $ yarn add ts-textrank

Usage

[]

-   Create a config object
-   Create a summarizer with your config
-   Call summarizer.summarize to extract most relevant senteces from an
    input text

    import { SorensenDiceSimilarity, DefaultTextParser, ConsoleLogger, RelativeSummarizerConfig, Summarizer, NullLogger, Sentence } from "ts-textrank";

    //Only one similarity function implemented at this moment.
    //More could come in future versions.
    const sim = new SorensenDiceSimilarity()

    //Only one text parser available a this moment
    const parser = new DefaultTextParser()

    //Do you want logging?
    const logger = new ConsoleLogger()

    //You can implement LoggerInterface for different behavior,
    //or if you don't want logging, use this:
    //const logger = new NullLogger()

    //Set the summary length as a percentage of full text length
    const ratio = .25 

    //Damping factor. See "How it works" for more info.
    const d = .85

    //How do you want summary sentences to be sorted?
    //Get sentences in the order that they appear in text:
    const sorting = SORT_BY.OCCURRENCE
    //Or sort them by relevance:
    //const sorting = SORT_BY.SCORE
    const config = new RelativeSummarizerConfig(ratio, sim, parser, d, sorting)

    //Or, if you want a fixed number of sentences:
    //const number = 5
    //const config = new AbsoluteSummarizerConfig(number, sim, parser, d, sorting)    

    const summarizer = new Summarizer(config, logger)

    //Language is used for stopword removal.
    //See https://github.com/fergiemcdowall/stopword for supported languages
    const lang = "en"

    const text = "...Text to summarize..."
    //summary will be an array of sentences summarizing text
    const summary = summarizer.summarize(text, lang)

How it works

[]

TextRank algorithm was introduced by Rada Mihalcea and Paul Tarau in
their paper "TextRank: Bringing Order into Texts" in 2004. It applies
the same principle that Google's PageRank used to discover relevant web
pages.

The idea is to split a text into sentences, and then calculate a score
for each sentence in terms of its similarity to the other sentences.
TextRank treats sentences having common words as a link between them
(like hyperlinks between web pages). Then, it applies a weight to that
link based on how many words the sentences have in common. ts-textrank
uses Sorensen-Dice Similarity for this.

The sentences with the higher score will be those that share the most
words with the rest and can be used as a summary of the whole text.

Damping factor

[]

Original PageRank algorithm included a damping factor to represent the
probability of a user clicking random links on a page. In this context,
the authors have kept it and fixed it to a value of .85, but it can be
modified if needed for better results in specific cases.

About

Typescript implementation of the TextRank algorithm

[] www.npmjs.com/package/ts-textrank

Topics

typescript text-summarization textrank-algorithm

Resources

[] Readme

[] Activity

Stars

[] 7 stars

Watchers

[] 1 watching

Forks

[] 3 forks

Report repository

Releases

[] 1 tags

Packages 0

No packages published

Contributors 2

-   [@NachoBrito] NachoBrito Nacho Brito
-   [@meszaroszoltan] meszaroszoltan Zoltán Mészáros

Languages

-   [] TypeScript 99.7%
-   [] Shell 0.3%

Footer

[] © 2024 GitHub, Inc.

Footer navigation

-   Terms
-   Privacy
-   Security
-   Status
-   Docs
-   Contact
-   Manage cookies
-   Do not share my personal information

[]

[]

You can’t perform that action at this time.

[]

[] []

[] []
`

const sample2 = `
unselected package libx11-data.\r\nPreparing to unpack .../099-libx11-data_2%3a1.8.4-2+deb12u2_all.deb ...\r\nUnpacking libx11-data (2:1.8.4-2+deb12u2) ...\r\nSelecting previously unselected package libx11-6:arm64.\r\nPreparing to unpack .../100-libx11-6_2%3a1.8.4-2+deb12u2_arm64.deb ...\r\nUnpacking libx11-6:arm64 (2:1.8.4-2+deb12u2) ...\r\nSelecting previously unselected package libxpm4:arm64.\r\nPreparing to unpack .../101-libxpm4_1%3a3.5.12-1.1+deb12u1_arm64.deb ...\r\nUnpacking libxpm4:arm64 (1:3.5.12-1.1+deb12u1) ...\r\nSelecting previously unselected package libgd3:arm64.\r\nPreparing to unpack .../102-libgd3_2.3.3-9_arm64.deb ...\r\nUnpacking libgd3:arm64 (2.3.3-9) ...\r\nSelecting previously unselected package libc-devtools.\r\nPreparing to unpack .../103-libc-devtools_2.36-9+deb12u8_arm64.deb ...\r\nUnpacking libc-devtools (2.36-9+deb12u8) ...\r\nSelecting previously unselected package libexpat1-dev:arm64.\r\nPreparing to unpack .../104-libexpat1-dev_2.5.0-1_arm64.deb ...\r\nUnpacking libexpat1-dev:arm64 (2.5.0-1) ...\r\nSelecting previously unselected package libfile-fcntllock-perl.\r\nPreparing to unpack .../105-libfile-fcntllock-perl_0.22-4+b1_arm64.deb ...\r\nUnpacking libfile-fcntllock-perl (0.22-4+b1) ...\r\nSelecting previously unselected package libgpm2:arm64.\r\nPreparing to unpack .../106-libgpm2_1.20.7-10+b1_arm64.deb ...\r\nUnpacking libgpm2:arm64 (1.20.7-10+b1) ...\r\nSelecting previously unselected package libjs-jquery.\r\nPreparing to unpack .../107-libjs-jquery_3.6.1+dfsg+~3.5.14-1_all.deb ...\r\nUnpacking libjs-jquery (3.6.1+dfsg+~3.5.14-1) ...\r\nSelecting previously unselected package libjs-underscore.\r\nPreparing to unpack .../108-libjs-underscore_1.13.4~dfsg+~1.11.4-3_all.deb ...\r\nUnpacking libjs-underscore (1.13.4~dfsg+~1.11.4-3) ...\r\nSelecting previously unselected package libjs-sphinxdoc.\r\nPreparing to unpack .../109-libjs-sphinxdoc_5.3.0-4_all.deb ...\r\nUnpacking libjs-sphinxdoc (5.3.0-4) ...\r\nSelecting previously unselected package libldap-common.\r\nPreparing to unpack .../110-libldap-common_2.5.13+dfsg-5_all.deb ...\r\nUnpacking libldap-common (2.5.13+dfsg-5) ...\r\nSelecting previously unselected package libpython3.11:arm64.\r\nPreparing to unpack .../111-libpython3.11_3.11.2-6+deb12u3_arm64.deb ...\r\nUnpacking libpython3.11:arm64 (3.11.2-6+deb12u3) ...\r\nSelecting previously unselected package zlib1g-dev:arm64.\r\nPreparing to unpack .../112-zlib1g-dev_1%3a1.2.13.dfsg-1_arm64.deb ...\r\nUnpacking zlib1g-dev:arm64 (1:1.2.13.dfsg-1) ...\r\nSelecting previously unselected package libpython3.11-dev:arm64.\r\nPreparing to unpack .../113-libpython3.11-dev_3.11.2-6+deb12u3_arm64.deb ...\r\nUnpacking libpython3.11-dev:arm64 (3.11.2-6+deb12u3) ...\r\nSelecting previously unselected package libpython3-dev:arm64.\r\nPreparing to unpack .../114-libpython3-dev_3.11.2-1+b1_arm64.deb ...\r\nUnpacking libpython3-dev:arm64 (3.11.2-1+b1) ...\r\nSelecting previously unselected package libsasl2-modules:arm64.\r\nPreparing to unpack .../115-libsasl2-modules_2.1.28+dfsg-10_arm64.deb ...\r\nUnpacking libsasl2-modules:arm64 (2.1.28+dfsg-10) ...\r\nSelecting previously unselected package manpages-dev.\r\nPreparing to unpack .../116-manpages-dev_6.03-2_all.deb ...\r\nUnpacking manpages-dev (6.03-2) ...\r\nSelecting previously unselected package python3.11-dev.\r\nPreparing to unpack .../117-python3.11-dev_3.11.2-6+deb12u3_arm64.deb ...\r\nUnpacking python3.11-dev (3.11.2-6+deb12u3) ...\r\nSelecting previously unselected package python3-lib2to3.\r\nPreparing to unpack .../118-python3-lib2to3_3.11.2-3_all.deb ...\r\nUnpacking python3-lib2to3 (3.11.2-3) ...\r\nSelecting previously unselected package python3-distutils.\r\nPreparing to unpack .../119-python3-distutils_3.11.2-3_all.deb ...\r\nUnpacking python3-distutils (3.11.2-3) ...\r\nSelecting previously unselected package python3-dev.\r\nPreparing to unpack .../120-python3-dev_3.11.2-1+b1_arm64.deb ...\r\nUnpacking python3-dev (3.11.2-1+b1) ...\r\nSelecting previously unselected package python3-pkg-resources.\r\nPreparing to unpack .../121-python3-pkg-resources_66.1.1-1_all.deb ...\r\nUnpacking python3-pkg-resources (66.1.1-1) ...\r\nSelecting previously unselected package python3-setuptools.\r\nPreparing to unpack .../122-python3-setuptools_66.1.1-1_all.deb ...\r\nUnpacking python3-setuptools (66.1.1-1) ...\r\nSelecting previously unselected package python3-wheel.\r\nPreparing to unpack .../123-python3-wheel_0.38.4-2_all.deb ...\r\nUnpacking python3-wheel (0.38.4-2) ...\r\nSelecting previously unselected package python3-pip.\r\nPreparing to unpack .../124-python3-pip_23.0.1+dfsg-1_all.deb ...\r\nUnpacking python3-pip (23.0.1+dfsg-1) ...\r\nSelecting previously unselected package python3-pip-whl.\r\nPreparing to unpack .../125-python3-pip-whl_23.0.1+dfsg-1_all.deb ...\r\nUnpacking python3-pip-whl (23.0.1+dfsg-1) ...\r\nSelecting previously unselected package python3-setuptools-whl.\r\nPreparing to unpack .../126-python3-setuptools-whl_66.1.1-1_all.deb ...\r\nUnpacking python3-setuptools-whl (66.1.1-1) ...\r\nSelecting previously unselected package python3.11-venv.\r\nPreparing to unpack .../127-python3.11-venv_3.11.2-6+deb12u3_arm64.deb ...\r\nUnpacking python3.11-venv (3.11.2-6+deb12u3) ...\r\nSelecting previously unselected package python3-venv.\r\nPreparing to unpack .../128-python3-venv_3.11.2-1+b1_arm64.deb ...\r\nUnpacking python3-venv (3.11.2-1+b1) ...\r\nSetting up libksba8:arm64 (1.6.3-2) ...\r\nSetting up media-types (10.0.0) ...\r\nSetting up javascript-common (11+nmu1) ...\r\nSetting up libaom3:arm64 (3.6.0-1+deb12u1) ...\r\nSetting up libabsl20220623:arm64 (20220623.1-1) ...\r\nSetting up libxau6:arm64 (1:1.0.9-1) ...\r\nSetting up python3-setuptools-whl (66.1.1-1) ...\r\nSetting up libkeyutils1:arm64 (1.6.3-2) ...\r\nSetting up libgpm2:arm64 (1.20.7-10+b1) ...\r\nSetting up liblerc4:arm64 (4.0.0+ds-2) ...\r\nSetting up manpages (6.03-2) ...\r\nSetting up libtirpc-common (1.3.3+ds-1) ...\r\nSetting up libbrotli1:arm64 (1.0.9-2+b6) ...\r\nSetting up libsqlite3-0:arm64 (3.40.1-2) ...\r\nSetting up libsasl2-modules:arm64 (2.1.28+dfsg-10) ...\r\nSetting up binutils-common:arm64 (2.40-2) ...\r\nSetting up libdeflate0:arm64 (1.14-1) ...\r\nSetting up linux-libc-dev:arm64 (6.1.106-3) ...\r\nSetting up libctf-nobfd0:arm64 (2.40-2) ...\r\nSetting up libnpth0:arm64 (1.6-3) ...\r\nSetting up krb5-locales (1.20.1-2+deb12u2) ...\r\nSetting up libsvtav1enc1:arm64 (1.4.1+dfsg-1) ...\r\nSetting up libassuan0:arm64 (2.5.5-5) ...\r\nSetting up libgomp1:arm64 (12.2.0-14) ...\r\nSetting up bzip2 (1.0.8-5+b1) ...\r\nSetting up libldap-common (2.5.13+dfsg-5) ...\r\nSetting up libjbig0:arm64 (2.1-6.1) ...\r\nSetting up librav1e0:arm64 (0.5.1-6) ...\r\nSetting up libfakeroot:arm64 (1.31-1.2) ...\r\nSetting up libjansson4:arm64 (2.14-2) ...\r\nSetting up libkrb5support0:arm64 (1.20.1-2+deb12u2) ...\r\nSetting up libsasl2-modules-db:arm64 (2.1.28+dfsg-10) ...\r\nSetting up fakeroot (1.31-1.2) ...\r\nupdate-alternatives: using /usr/bin/fakeroot-sysv to provide /usr/bin/fakeroot (fakeroot) in auto mode\r\nSetting up perl-modules-5.36 (5.36.0-7+deb12u1) ...\r\nSetting up rpcsvc-proto (1.4.3-1) ...\r\nSetting up libjpeg62-turbo:arm64 (1:2.1.5-2) ...\r\nSetting up libx11-data (2:1.8.4-2+deb12u2) ...\r\nSetting up make (4.3-4.1) ...\r\nSetting up libmpfr6:arm64 (4.2.0-1) ...\r\nSetting up gnupg-l10n (2.2.40-1.1) ...\r\nSetting up xz-utils (5.4.1-0.2) ...\r\nupdate-alternatives: using /usr/bin/xz to provide /usr/bin/lzma (lzma) in auto mode\r\nSetting up libpng16-16:arm64 (1.6.39-2) ...\r\nSetting up libmpc3:arm64 (1.3.1-1) ...\r\nSetting up libatomic1:arm64 (12.2.0-14) ...\r\nSetting up patch (2.7.6-7) ...\r\nSetting up fonts-dejavu-core (2.37-6) ...\r\nSetting up libgav1-1:arm64 (0.18.0-1+b1) ...\r\nSetting up libncursesw6:arm64 (6.4-4) ...\r\nSetting up libk5crypto3:arm64 (1.20.1-2+deb12u2) ...\r\nSetting up libdav1d6:arm64 (1.0.0-2+deb12u1) ...\r\nSetting up libsasl2-2:arm64 (2.1.28+dfsg-10) ...\r\nSetting up libwebp7:arm64 (1.2.4-0.2+deb12u1) ...\r\nSetting up libubsan1:arm64 (12.2.0-14) ...\r\nSetting up libnuma1:arm64 (2.0.16-1) ...\r\nSetting up libhwasan0:arm64 (12.2.0-14) ...\r\nSetting up libcrypt-dev:arm64 (1:4.4.33-2) ...\r\nSetting up libtiff6:arm64 (4.5.0-6+deb12u1) ...\r\nSetting up libasan8:arm64 (12.2.0-14) ...\r\nSetting up netbase (6.4) ...\r\nSetting up libkrb5-3:arm64 (1.20.1-2+deb12u2) ...\r\nSetting up libtsan2:arm64 (12.2.0-14) ...\r\nSetting up libjs-jquery (3.6.1+dfsg+~3.5.14-1) ...\r\nSetting up libbinutils:arm64 (2.40-2) ...\r\nSetting up libisl23:arm64 (0.25-1.1) ...\r\nSetting up libde265-0:arm64 (1.0.11-1+deb12u2) ...\r\nSetting up libc-dev-bin (2.36-9+deb12u8) ...\r\nSetting up openssl (3.0.14-1~deb12u2) ...\r\nSetting up libbsd0:arm64 (0.11.7-2) ...\r\nSetting up libyuv0:arm64 (0.0~git20230123.b2528b0-1) ...\r\nSetting up readline-common (8.2-1.3) ...\r\nSetting up libcc1-0:arm64 (12.2.0-14) ...\r\nSetting up liblocale-gettext-perl (1.07-5) ...\r\nSetting up liblsan0:arm64 (12.2.0-14) ...\r\nSetting up libitm1:arm64 (12.2.0-14) ...\r\nSetting up libgdbm6:arm64 (1.23-3) ...\r\nSetting up libjs-underscore (1.13.4~dfsg+~1.11.4-3) ...\r\nSetting up libctf0:arm64 (2.40-2) ...\r\nSetting up pinentry-curses (1.2.1-1) ...\r\nSetting up manpages-dev (6.03-2) ...\r\nSetting up libxdmcp6:arm64 (1:1.1.2-3) ...\r\nSetting up cpp-12 (12.2.0-14) ...\r\nSetting up libxcb1:arm64 (1.15-1) ...\r\nSetting up libavif15:arm64 (0.11.1-1) ...\r\nSetting up fontconfig-config (2.14.1-4) ...\r\ndebconf: unable to initialize frontend: Dialog\r\ndebconf: (TERM is not set, so the dialog frontend is not usable.)\r\ndebconf: falling back to frontend: Readline\r\ndebconf: unable to initialize frontend: Readline\r\ndebconf: (This frontend requires a controlling tty.)\r\ndebconf: falling back to frontend: Teletype\r\nSetting up libreadline8:arm64 (8.2-1.3) ...\r\nSetting up libldap-2.5-0:arm64 (2.5.13+dfsg-5) ...\r\nSetting up ca-certificates (20230311) ...\r\ndebconf: unable to initialize frontend: Dialog\r\ndebconf: (TERM is not set, so the dialog frontend is not usable.)\r\ndebconf: falling back to frontend: Readline\r\ndebconf: unable to initialize frontend: Readline\r\ndebconf: (This frontend requires a controlling tty.)\r\ndebconf: falling back to frontend: Teletype\r\nUpdating certificates in /etc/ssl/certs...\r\n140 added, 0 removed; done.\r\nSetting up libgprofng0:arm64 (2.40-2) ...\r\nSetting up libfreetype6:arm64 (2.12.1+dfsg-5+deb12u3) ...\r\nSetting up libgcc-12-dev:arm64 (12.2.0-14) ...\r\nSetting up libgssapi-krb5-2:arm64 (1.20.1-2+deb12u2) ...\r\nSetting up libgdbm-compat4:arm64 (1.23-3) ...\r\nSetting up libjs-sphinxdoc (5.3.0-4) ...\r\nSetting up libx265-199:arm64 (3.5-2+b1) ...\r\nSetting up cpp (4:12.2.0-3) ...\r\nSetting up gpgconf (2.2.40-1.1) ...\r\nSetting up libx11-6:arm64 (2:1.8.4-2+deb12u2) ...\r\nSetting up libfontconfig1:arm64 (2.14.1-4) ...\r\nSetting up libperl5.36:arm64 (5.36.0-7+deb12u1) ...\r\nSetting up gpg (2.2.40-1.1) ...\r\nSetting up gnupg-utils (2.2.40-1.1) ...\r\nSetting up libtirpc3:arm64 (1.3.3+ds-1) ...\r\nSetting up gpg-agent (2.2.40-1.1) ...\r\nSetting up libxpm4:arm64 (1:3.5.12-1.1+deb12u1) ...\r\nSetting up python3-pip-whl (23.0.1+dfsg-1) ...\r\nSetting up gpgsm (2.2.40-1.1) ...\r\nSetting up libheif1:arm64 (1.15.1-1) ...\r\nSetting up binutils-aarch64-linux-gnu (2.40-2) ...\r\nSetting up binutils (2.40-2) ...\r\nSetting up dirmngr (2.2.40-1.1) ...\r\nSetting up perl (5.36.0-7+deb12u1) ...\r\nSetting up libtirpc-dev:arm64 (1.3.3+ds-1) ...\r\nSetting up gcc-12 (12.2.0-14) ...\r\nSetting up libgd3:arm64 (2.3.3-9) ...\r\nSetting up libdpkg-perl (1.21.22) ...\r\nSetting up gpg-wks-server (2.2.40-1.1) ...\r\nSetting up libnsl2:arm64 (1.3.0-2) ...\r\nSetting up libc-devtools (2.36-9+deb12u8) ...\r\nSetting up gpg-wks-client (2.2.40-1.1) ...\r\nSetting up libfile-fcntllock-perl (0.22-4+b1) ...\r\nSetting up libalgorithm-diff-perl (1.201-1) ...\r\nSetting up libpython3.11-stdlib:arm64 (3.11.2-6+deb12u3) ...\r\nSetting up gcc (4:12.2.0-3) ...\r\nSetting up dpkg-dev (1.21.22) ...\r\nSetting up libnsl-dev:arm64 (1.3.0-2) ...\r\nSetting up gnupg (2.2.40-1.1) ...\r\nSetting up libc6-dev:arm64 (2.36-9+deb12u8) ...\r\nSetting up libalgorithm-diff-xs-perl:arm64 (0.04-8+b1) ...\r\nSetting up libpython3-stdlib:arm64 (3.11.2-1+b1) ...\r\nSetting up libalgorithm-merge-perl (0.08-5) ...\r\nSetting up python3.11 (3.11.2-6+deb12u3) ...\r\nSetting up libpython3.11:arm64 (3.11.2-6+deb12u3) ...\r\nSetting up libstdc++-12-dev:arm64 (12.2.0-14) ...\r\nSetting up python3 (3.11.2-1+b1) ...\r\nrunning python rtupdate hooks for python3.11...\r\nrunning python post-rtupdate hooks for python3.11...\r\nSetting up libexpat1-dev:arm64 (2.5.0-1) ...\r\nSetting up zlib1g-dev:arm64 (1:1.2.13.dfsg-1) ...\r\nSetting up python3-lib2to3 (3.11.2-3) ...\r\nSetting up g++-12 (12.2.0-14) ...\r\nSetting up python3-pkg-resources (66.1.1-1) ...\r\nSetting up python3-distutils (3.11.2-3) ...\r\nSetting up python3-setuptools (66.1.1-1) ...\r\nSetting up python3-wheel (0.38.4-2) ...\r\nSetting up python3.11-venv (3.11.2-6+deb12u3) ...\r\nSetting up libpython3.11-dev:arm64 (3.11.2-6+deb12u3) ...\r\nSetting up python3-pip (23.0.1+dfsg-1) ...\r\nSetting up g++ (4:12.2.0-3) ...\r\nupdate-alternatives: using /usr/bin/g++ to provide /usr/bin/c++ (c++) in auto mode\r\nSetting up build-essential (12.9) ...\r\nSetting up libpython3-dev:arm64 (3.11.2-1+b1) ...\r\nSetting up python3.11-dev (3.11.2-6+deb12u3) ...\r\nSetting up python3-venv (3.11.2-1+b1) ...\r\nSetting up python3-dev (3.11.2-1+b1) ...\r\nProcessing triggers for libc-bin (2.36-9+deb12u8) ...\r\nProcessing triggers for ca-certificates (20230311) ...\r\nUpdating certificates in /etc/ssl/certs...\r\n0 added, 0 removed; done.\r\nRunning hooks in /etc/ca-certificates/update.d...\r\ndone.\r\n ---> Removed intermediate container 93e6725c8fc0\n ---> 94ed0e00335f\nStep 7/11 : RUN python3 -m venv myenv\n ---> Running in 5ecbd4ac77f1\n ---> Removed intermediate container 5ecbd4ac77f1\n ---> e39c906ab3b1\nStep 8/11 : RUN source myenv/bin/activate\n ---> Running in 7c3cca047a3f\n\u001b[91m/bin/sh: 1: source: not found\n\u001b[0m"
`
