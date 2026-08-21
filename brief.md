project name: brainrot

this project is a game that simulates browsing social media's short form video content and manipulating the algorithm to reach a goal.

the objective:
the user is shown a video/image with no context except tags that's associated with it.
the user is then shown a feed of random videos that's completely irrelevant to the goal.
they must scroll through videos/images and 'like' the content to influence the algorithm to show more of the content until you can make it show the goal image/video.

the image is not shown immediately and a minimum of 5 layers (meaning content added) is required to achieve the goal.

how the algorithm works:
we start with equal weights of each random category. these semantic tags are weighted/grouped as 1.
example, if there's 5 posts with 'food', then those 5 count as 1.
if the user likes another food post, then the weight goes up slightly to 1.2, so on the next batch of content to receive, the algorithm is more likely to show more food posts compared to the others.
there's also a possibility of adding new categories which makes it more challenging.
the content is feed in batches (or layers) where we generate at most 20 at a time, until the reach near the end before we fetch the next batch of 20.
the net batch is never predetermined and depends entirely on how the category weights are weighted.
the batch number right now doesn't need to be 20, it could be 10.

how to win the game: the user must manipulate the algorithm to show what they're looking for. there's a gauge called 'brainrot' that deteriorates with each scroll or irrelevant like. it starts at 100% and if it reaches 0%, the user loses. this is to prevent an infinite game where the user fails to correctly influence the algorithm.

scrolling velocity affects the rate of deterioration. just an example with no numbers set in mind yet: scrolling 5 posts per second vs 2 posts per second will degrade faster.

there's also another meter that tells you how close/likely you are to finding the post.

the ui resembles tiktok.
on the bottom left, it has the username shown as well as tags #tag, then on the right side, it's a vertical menu with 3 items: the temperature icon, the brain icon, and a heart icon. the temperature tells you if you're getting hot or cold. the brain is you brainrot meter. and the heart is the 'like' feature. you can either press the heart or double tap the screen to like. the swiping is vertical as well, and you can swipe backwards if needed.

this is a daily challenge game where everyone looks for the same target/goal post.

technical challenges:
there has to be a guaranteed way to find the target post otherwise the user might not be able to actually feasibly. to do this, we might have to search several times to create a cached path so that we can actually reach an image. example, we search the first 20, and then from there, we grab a random category, then do another 20 batch with that elevated category. we do that until we reach a minimum of 5 layers (100 posts). if the user is on the first layer and fails to like the correct thing or anything, it will either fetch the new weighted category's batch, or a completely new set of random posts. however, even if the user fetches the wrong post, there must be at least 1 post that can be linked to the goal post.

if possible, we might also want to generate some voiceovers and overlays on the videos as well as royalty free music so that they resemble actual social media posts more.

techspecs:
we're going to implement this with vite/react, tabler icons via npm, and daisyUI/tailwind for a consistent ui. no backend needed for now unless we start to go live. we could cache things locally in the time being.
possibly also use tanstack for data fetching and routing.
need confetti as well when user find the goal post.
potentially use pixabay API for getting the videos needed.

there's a couple of main screens:
loading/splash page.
goal preview page
posts/scrolling
goal found (still under post but will display confetti when found).

so the flow is: load the game, show the target, when the user is ready then they can start swiping. they cannot swipe back to the original image.
loop swipe and like until they swipe to the correct target and it automatically grants them the win, no need to 'like' the target post.

-- update 1
need to change the value of the brainrot decrement. make it a base of 1% per post, and scale it twice exponentially from 1,2,4 with 4% being the max if you scroll too fast.

for the 'likes' we'll also add a random number of likes to it similar to tiktok.
